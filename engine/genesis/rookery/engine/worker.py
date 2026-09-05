"""Alpha engine: queue, scheduler and worker loop (conditions 4, 5,
11).

This is the part that turns the components into an engine. The order
of the gates is the design:

    startup recovery
      -> halt check      (auditor stop outranks everything)
      -> budget check    (external work only; local work continues)
      -> claim           (atomic, leased)
      -> isolate         (worktree on a throwaway branch)
      -> plan candidates (risk x budget stage)
      -> handler         (the actual work)
      -> validator       (did it work?)
      -> auditor         (is that answer trustworthy?)
      -> adopt or roll back
      -> complete or fail

Nothing here depends on a clean shutdown. A worker killed at any line
loses its lease, and the next startup returns the task to the queue,
sweeps its reservation and deletes its worktree. That is why the
crash path needs no code of its own: it is the same path as a lease
expiring.

Concurrency is bounded by construction - N worker threads, each
claiming one task at a time through the store's IMMEDIATE
transaction, so two workers cannot hold the same task.
"""

from __future__ import annotations

import threading
import time
import traceback
from dataclasses import dataclass, field
from typing import Callable

from genesis.rookery.engine.auditor import (
    Auditor, ValidatorVerdict, engine_halted)
from genesis.rookery.engine.budget import BudgetGuard
from genesis.rookery.engine.isolation import (
    IsolationError, Workspace, recover_workspaces)
from genesis.rookery.engine.pr import PrPreparer, pr_body
from genesis.rookery.engine.report import DailyReporter
from genesis.rookery.engine.risk import (
    CandidatePlan, RiskSignals, plan_candidates)
from genesis.rookery.engine.safety import AuditedPolicy, SafetyPolicy
from genesis.rookery.engine.store import Store, Task, new_worker_id

DEFER_SECONDS = 3600.0
HEARTBEAT_S = 60.0
MAINTENANCE_S = 300.0

# 인프라 백오프 (4개월차 드라이런 1차 부검): WinError 10055로 16시간
# 동안 무의미 재시도 90회 - 연속 인프라 오류에 제도가 없었다.
# (b) 재검증 B팔 1차: 계정 크레딧 소진이 HTTP 400으로 돌아와 13건의
# 시도를 2분 만에 전부 태웠다 - API 측 거절(잔액·속도 제한·5xx·
# 과부하)도 인프라다. 시도를 돌려주고(requeue) 연속이면 백오프.
INFRA_MARKERS = ("10055", "urlopen error", "getaddrinfo",
                 "Connection refused", "ConnectionReset",
                 "credit balance", "HTTP 429", "HTTP 5",
                 "overloaded", "rate_limit")


def is_infra_error(error: str) -> bool:
    return any(m in error for m in INFRA_MARKERS)
INFRA_CONSEC_FLAG = "infra_consec"
INFRA_BACKOFF_FLAG = "infra_backoff_until"
INFRA_THRESHOLD = 5
INFRA_BACKOFF_S = 1800.0          # 30분, 회복 시 자동 해제


@dataclass
class TaskContext:
    task: Task
    workspace: Workspace
    plan: CandidatePlan
    store: Store
    guard: BudgetGuard
    client: object | None = None
    heartbeat: Callable[[], bool] = lambda: True


@dataclass
class HandlerOutcome:
    """What a handler returns: the work's result plus the evidence
    the auditor needs to judge the validator's answer."""

    verdict: ValidatorVerdict
    result: dict = field(default_factory=dict)
    commit_message: str = "rookery: automated change"
    open_pr: bool = False


@dataclass
class HandlerSpec:
    fn: Callable[[TaskContext], HandlerOutcome]
    external: bool = True          # needs the paid API?


class Engine:
    def __init__(self, store: Store, guard: BudgetGuard,
                 auditor: Auditor, repo: str, work_root: str,
                 handlers: dict[str, HandlerSpec] | None = None,
                 policy: SafetyPolicy | None = None,
                 reporter: DailyReporter | None = None,
                 client_factory: Callable[[], object] | None = None,
                 workers: int = 2, base_branch: str = "main",
                 pr_preparer: PrPreparer | None = None,
                 smart_client_factory: Callable[[], object]
                 | None = None):
        self.store = store
        self.guard = guard
        self.auditor = auditor
        self.repo = repo
        self.work_root = work_root
        self.handlers = handlers or {}
        self.policy = AuditedPolicy(policy or SafetyPolicy(), store)
        self.reporter = reporter
        self.client_factory = client_factory
        self.smart_client_factory = smart_client_factory
        self.workers = max(1, workers)
        self.pr_preparer = pr_preparer or PrPreparer(
            store, base=base_branch)
        self._stop = threading.Event()
        self._last_maintenance = 0.0

    # ------------------------------------------------------ recovery

    def startup_recovery(self) -> dict:
        """Condition 11. Idempotent, so running it on every boot -
        and on a boot that follows a clean stop - is harmless."""
        orphans = self.store.recover_orphans()
        swept = self.guard.sweep_expired()
        active = {t["id"] for t in self._active_tasks()}
        cleaned = recover_workspaces(self.repo, self.work_root, active)
        reports = self.reporter.ensure() if self.reporter else []
        self.store.log(None, None, "startup_recovery", {
            "requeued_tasks": orphans, "swept_reservations": swept,
            "cleaned_workspaces": cleaned, "reports_written": reports})
        return {"requeued": orphans, "reservations": swept,
                "workspaces": cleaned, "reports": reports}

    def _active_tasks(self) -> list[dict]:
        rows = self.store.conn.execute(
            "SELECT id FROM tasks WHERE state IN ('leased','pending')")
        return [dict(r) for r in rows]

    def maintenance(self, now: float | None = None) -> None:
        now = now if now is not None else time.time()
        if now - self._last_maintenance < MAINTENANCE_S:
            return
        self._last_maintenance = now
        self.store.recover_orphans(now)
        self.guard.sweep_expired(now)
        if self.reporter:
            self.reporter.ensure(now)

    # --------------------------------------------------------- gates

    def can_work(self, external: bool = True) -> tuple[bool, str]:
        if engine_halted(self.store):
            return False, "auditor halt - 사람 확인 필요"
        ok, why = self.guard.allow_new_work(external=external)
        return ok, why

    def _claimable_kinds(self) -> list[str] | None:
        """Under a budget stop - or an infra backoff - only local
        handlers may run."""
        ok, _ = self.guard.allow_new_work(external=True)
        if ok and not self._infra_backed_off():
            return None
        local = [k for k, h in self.handlers.items() if not h.external]
        return local

    # ---------------------------------------------- infra backoff

    def _infra_backed_off(self, now: float | None = None) -> bool:
        until = self.store.get_flag(INFRA_BACKOFF_FLAG)
        return bool(until) and (now or time.time()) < float(until)

    def _note_infra_failure(self, error: str) -> None:
        """연속 인프라 오류 카운트. 문턱 도달 시 외부 작업을 내구적
        으로 백오프 - 무의미 재시도 루프를 제도가 끊는다. 회복은
        시간 경과 + 다음 성공적 처리로 자동."""
        if not is_infra_error(error):
            return
        n = int(self.store.get_flag(INFRA_CONSEC_FLAG, 0)) + 1
        self.store.set_flag(INFRA_CONSEC_FLAG, n)
        if n >= INFRA_THRESHOLD:
            until = time.time() + INFRA_BACKOFF_S
            self.store.set_flag(INFRA_BACKOFF_FLAG, until)
            self.store.set_flag(INFRA_CONSEC_FLAG, 0)
            self.store.log(None, None, "infra_backoff",
                           {"consecutive": n,
                            "backoff_s": INFRA_BACKOFF_S,
                            "error": error[:200]})

    def _note_processed_ok(self) -> None:
        self.store.set_flag(INFRA_CONSEC_FLAG, 0)
        self.store.clear_flag(INFRA_BACKOFF_FLAG)

    # ---------------------------------------------------------- loop

    def run_once(self, worker_id: str) -> bool:
        """Claim and process one task. Returns False when there was
        nothing to do."""
        if engine_halted(self.store):
            return False
        kinds = self._claimable_kinds()
        if kinds is not None and not kinds:
            return False
        task = self.store.claim(worker_id, kinds=kinds)
        if task is None:
            return False
        spec = self.handlers.get(task.kind)
        if spec is None:
            self.store.fail(task, f"no handler for kind {task.kind}",
                            retry_in=DEFER_SECONDS)
            return True
        try:
            self._process(task, spec)
            self._note_processed_ok()
        except Exception as exc:                     # noqa: BLE001
            self.store.log(task.id, task.run_id, "worker_exception",
                           {"error": traceback.format_exc()[-1500:]})
            if is_infra_error(str(exc)):
                # 일은 시작도 못 했다 - 시도를 돌려주고 기다린다
                self.store.requeue(task, f"infra: {exc}"[:500],
                                   retry_in=HEARTBEAT_S)
            else:
                self.store.fail(task, f"worker_exception: {exc}"[:500])
            self._note_infra_failure(str(exc))
        return True

    def _process(self, task: Task, spec: HandlerSpec) -> None:
        signals = RiskSignals.from_payload(task.payload,
                                           prior_attempts=task.attempts - 1)
        plan = plan_candidates(signals, self.guard, self.store,
                               task.id)
        # a budget-driven deferral only makes sense for work that
        # spends: local tasks (log tidying, replays) cost nothing, so
        # restricting them would stall the engine for no saving
        if plan.deferred and not spec.external and \
                "제품 경계" not in plan.reason:
            plan.deferred = False
            plan.candidates = max(plan.candidates, 1)
        if plan.deferred:
            self.store.conn.execute(
                "UPDATE tasks SET state='pending', lease_owner=NULL,"
                " lease_expires_at=NULL, not_before=?, updated_at=?"
                " WHERE id=?",
                (time.time() + DEFER_SECONDS, time.time(), task.id))
            self.store.log(task.id, task.run_id, "task_deferred",
                           {"reason": plan.reason})
            self.store.conn.execute(
                "UPDATE runs SET state='deferred', ended_at=?"
                " WHERE id=?", (time.time(), task.run_id))
            return

        ws = Workspace(self.repo, task.id, self.work_root,
                       policy=self.policy).create()
        client = None
        if self.client_factory and spec.external:
            factory = self._pick_client_factory(task)
            client = factory()
        ctx = TaskContext(task=task, workspace=ws, plan=plan,
                          store=self.store, guard=self.guard,
                          client=client,
                          heartbeat=lambda: self.store.heartbeat(task))
        try:
            outcome = spec.fn(ctx)
            adopted, audit = self.auditor.accept_if_audited(
                outcome.verdict, task.run_id)
            cost = getattr(client, "usage", None)
            cost_usd = getattr(cost, "cost_usd", 0.0) if cost else 0.0
            tin = getattr(cost, "tokens_in", 0) if cost else 0
            tout = getattr(cost, "tokens_out", 0) if cost else 0

            if adopted:
                ws.commit(outcome.commit_message)
                pr = None
                if outcome.open_pr:
                    req = self.pr_preparer.prepare(
                        ws, task.id, outcome.commit_message,
                        pr_body(task.id, outcome.result,
                                outcome.verdict))
                    pr = req.to_dict()
                self.store.complete(
                    task, {**outcome.result, "adopted": True,
                           "branch": ws.branch, "pr": pr},
                    cost_usd=cost_usd, tokens_in=tin, tokens_out=tout)
                # keep the branch so a human can open the PR; the
                # worktree is disposable
                ws.destroy(delete_branch=False)
            else:
                ws.reset()
                reason = ("auditor disagreement: "
                          + "; ".join(f.message
                                      for f in audit.halting)) \
                    if not audit.agree else "validator rejected"
                self.store.fail(task, reason, cost_usd=cost_usd,
                                tokens_in=tin, tokens_out=tout)
                ws.destroy()
        except IsolationError as exc:
            # 격리 위반은 실패 처리로 끝나지 않는다 - 즉시·내구적
            # 엔진 정지 (무인 운영 규칙 2주차: 사후 발견 금지).
            # 해제는 사람의 resume만 가능하다.
            from genesis.rookery.engine.auditor import (
                ISOLATION_HALT_FLAG)
            self.store.set_flag(ISOLATION_HALT_FLAG, {
                "task_id": task.id, "error": str(exc)[:300]})
            self.store.log(task.id, task.run_id, "isolation_halt",
                           {"error": str(exc)[:300]})
            self.store.fail(task, f"path_outside_workspace: {exc}"[:500])
            ws.destroy()
        except Exception:
            ws.destroy()
            raise

    def _pick_client_factory(self, task: Task):
        """규칙 라우팅 (engine/routing.py). 실패 역산 위임 목록에
        걸리고 smart 공급자가 있으면 승급 - 결정을 원장에 남긴다.
        모델에게 라우팅을 묻는 경로는 없다."""
        from genesis.rookery.engine.routing import SMART, route
        tier = route(task.kind, task.attempts)
        if tier == SMART and self.smart_client_factory is not None:
            self.store.log(task.id, task.run_id, "routed_smart",
                           {"kind": task.kind,
                            "attempt": task.attempts})
            return self.smart_client_factory
        return self.client_factory

    # ------------------------------------------------------ lifetime

    def run_worker(self, worker_id: str | None = None,
                   idle_sleep: float = 1.0,
                   max_tasks: int | None = None,
                   exit_when_idle: bool = False) -> int:
        worker_id = worker_id or new_worker_id()
        done = 0
        while not self._stop.is_set():
            if max_tasks is not None and done >= max_tasks:
                break
            self.maintenance()
            if self.run_once(worker_id):
                done += 1
                continue
            if exit_when_idle:
                break
            if self._stop.wait(idle_sleep):
                break
        return done

    def run(self, duration_s: float | None = None,
            max_tasks_each: int | None = None,
            exit_when_idle: bool = False) -> list[int]:
        """Bounded concurrency: exactly `workers` threads.

        `exit_when_idle` gives a batch run that ends when the queue
        drains; without it the workers wait for new work, which is
        the server mode."""
        self.startup_recovery()
        results: list[int] = [0] * self.workers
        threads = []
        for i in range(self.workers):
            def target(idx=i):
                results[idx] = self.run_worker(
                    max_tasks=max_tasks_each,
                    exit_when_idle=exit_when_idle)
            t = threading.Thread(target=target, daemon=True)
            t.start()
            threads.append(t)
        if duration_s is not None:
            self._stop.wait(duration_s)
            self.stop()
        for t in threads:
            t.join()
        return results

    def drain(self, worker_id: str = "drain") -> int:
        """Process everything currently runnable, then return."""
        self.startup_recovery()
        n = 0
        while self.run_once(worker_id):
            n += 1
        return n

    def stop(self) -> None:
        self._stop.set()

    @property
    def stopped(self) -> bool:
        return self._stop.is_set()

    def wait_stop(self, timeout: float) -> bool:
        """Block up to `timeout` or until stopped. Returns True if the
        stop was signalled - lets a supervisor sleep interruptibly."""
        return self._stop.wait(timeout)
