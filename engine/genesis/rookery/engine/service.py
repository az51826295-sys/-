"""Alpha engine: the long-running service (build order step 8).

The entrypoint systemd starts. It wires the engine from the
environment, recovers whatever the last run left in flight, starts a
bounded pool of worker threads, and supervises them: writing a live
'today' report an operator can tail, finalizing each completed day
exactly once, and logging a heartbeat. On SIGTERM (systemd stop /
reboot) it stops the workers cleanly; on a crash or power loss it
needs no cleanup, because the next start's recovery is the same path
as a lease expiring.

Nothing here spends on its own. Work only runs when a task is queued
and the budget stage allows it, and every call goes through the
guarded client's reserve -> settle path.

  python -m genesis.rookery.engine.service            # serve forever
  python -m genesis.rookery.engine.service --check    # validate only
  python -m genesis.rookery.engine.service --report   # print today
"""

from __future__ import annotations

import logging
import os
import signal
import subprocess
import sys
import threading
import time
from logging.handlers import RotatingFileHandler

from genesis.rookery.engine.api import GuardedClient
from genesis.rookery.engine.auditor import Auditor, engine_halted
from genesis.rookery.engine.budget import BudgetGuard
from genesis.rookery.engine.config import ServiceConfig
from genesis.rookery.engine.handlers import code_fix_handler
from genesis.rookery.engine.agentic import agent_fix_handler
from genesis.rookery.engine.handlers_art import art_handler
from genesis.rookery.engine.handlers_extra import (
    add_docstring_handler, add_test_handler, data_convert_handler)
from genesis.rookery.engine.pr import LocalOnlyPrPreparer, PrPreparer
from genesis.rookery.engine.report import DailyReporter
from genesis.rookery.engine.store import Store
from genesis.rookery.engine.worker import Engine, HandlerSpec

log = logging.getLogger("rookery.alpha")


def setup_logging(config: ServiceConfig) -> None:
    os.makedirs(config.data_dir, exist_ok=True)
    fmt = logging.Formatter(
        "%(asctime)s %(levelname)s %(message)s")
    root = logging.getLogger("rookery")
    root.setLevel(logging.INFO)
    if not any(isinstance(h, RotatingFileHandler)
               for h in root.handlers):
        fh = RotatingFileHandler(config.log_path(), maxBytes=5_000_000,
                                 backupCount=5, encoding="utf-8")
        fh.setFormatter(fmt)
        root.addHandler(fh)
    if not any(isinstance(h, logging.StreamHandler)
               and not isinstance(h, RotatingFileHandler)
               for h in root.handlers):
        sh = logging.StreamHandler(sys.stdout)   # captured by journald
        sh.setFormatter(fmt)
        root.addHandler(sh)


def build_engine(config: ServiceConfig, client_factory=None,
                 name: str | None = None):
    """name이 있으면 다중 저장소 모드의 한 저장소(엔진·원장·워크트리를
    <data>/<tag>/<name>/ 아래에) - 인테이크 파이프라인이 enqueue한 곳과
    같은 원장을 연다. 없으면 단일 저장소(종전과 동일)."""
    if name is not None:
        repo = config.repo_path(name)
        data_dir = config.repo_data_dir(name)
        work_root = config.repo_work_root(name)
        db_path = config.repo_db_path(name)
        reports_dir = config.repo_reports_dir(name)
    else:
        repo, data_dir, work_root = (config.repo, config.data_dir,
                                     config.work_root)
        db_path, reports_dir = config.db_path(), config.reports_dir()
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(work_root, exist_ok=True)
    store = Store(db_path)
    guard = BudgetGuard(store, config.budget_policy())
    auditor = Auditor(store)
    reporter = DailyReporter(store, guard, out_dir=reports_dir)

    if client_factory is None:
        def client_factory():
            from genesis.mission7.proposers import AnthropicProvider

            provider = AnthropicProvider(config.model, 1.0,
                                         max_tokens=config.max_tokens)
            return GuardedClient(
                provider, store, guard,
                usd_per_mtok_in=config.price_in_per_mtok,
                usd_per_mtok_out=config.price_out_per_mtok,
                default_max_tokens=config.max_tokens)

    def smart_client_factory():
        from genesis.mission7.proposers import AnthropicProvider

        provider = AnthropicProvider(config.smart_model, 1.0,
                                     max_tokens=config.max_tokens)
        return GuardedClient(
            provider, store, guard,
            usd_per_mtok_in=config.smart_price_in_per_mtok,
            usd_per_mtok_out=config.smart_price_out_per_mtok,
            default_max_tokens=config.max_tokens)

    if name is not None and config.local_only_pr:
        pr_preparer = LocalOnlyPrPreparer(store, base="HEAD")
    else:
        pr_preparer = PrPreparer(store, remote=config.remote,
                                 base=config.base_branch)
    engine = Engine(
        store, guard, auditor, repo, work_root,
        handlers={
            "fix": HandlerSpec(code_fix_handler, external=True),
            "doc": HandlerSpec(add_docstring_handler, external=True),
            "test_add": HandlerSpec(add_test_handler, external=True),
            "data": HandlerSpec(data_convert_handler, external=True),
            "art": HandlerSpec(art_handler, external=True),
            "agent_fix": HandlerSpec(agent_fix_handler,
                                     external=True)},
        client_factory=client_factory, reporter=reporter,
        base_branch=("HEAD" if name is not None else config.base_branch),
        workers=config.workers, pr_preparer=pr_preparer,
        smart_client_factory=smart_client_factory)
    return store, guard, auditor, reporter, engine


def _heartbeat(engine: Engine, guard: BudgetGuard, store: Store,
               reporter: DailyReporter, name: str = "") -> None:
    counts = store.counts()
    st = guard.status()
    halted = engine_halted(store)
    pending_pr = len(engine.pr_preparer.pending(limit=1000))
    log.info(
        "heartbeat%s 작업=%s 예산단계=%s 월=%.0f원 대기PR=%d%s",
        f"[{name}]" if name else "",
        {k: counts.get(k, 0) for k in
         ("pending", "leased", "succeeded", "failed")},
        st.stage, st.month_total_krw, pending_pr,
        " ***감사정지***" if halted else "")
    # a live snapshot an operator can tail; finalize completed days
    try:
        with open(os.path.join(config_reports_dir(reporter),
                               "today.txt"), "w",
                  encoding="utf-8") as f:
            f.write(reporter.preview())
    except OSError:
        pass
    for day in reporter.ensure():
        log.info("일일 보고 확정: %s", day)


def config_reports_dir(reporter: DailyReporter) -> str:
    d = reporter.out_dir or "."
    os.makedirs(d, exist_ok=True)
    return d


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__)))))


def _run_intake(config: ServiceConfig) -> None:
    """주기 인테이크: tools/intake_pipeline.py를 같은 태그로 호출한다
    (멱등이라 반복 호출이 안전). 실패는 로그로만 - 상주는 계속."""
    argv = [sys.executable, os.path.join(ROOT_DIR, "tools",
                                         "intake_pipeline.py"),
            "--tag", config.tag]
    if config.intake_mock:
        argv.append("--mock")
    try:
        r = subprocess.run(argv, cwd=ROOT_DIR, capture_output=True,
                           text=True, encoding="utf-8", errors="replace",
                           timeout=3600)
        log.info("인테이크 실행 rc=%s %s", r.returncode,
                 (r.stdout or "")[-400:].replace("\n", " "))
    except Exception as exc:                     # noqa: BLE001
        log.error("인테이크 실행 실패: %s", str(exc)[:200])


class MockCaller:
    """④ 48h 목 드라이런용 가짜 모델: 읽기 1회 후 done (오라클이
    기각). 배관·상주·인테이크·원장·회복을 지출 0으로 본다. 채택
    경로는 tests/가 따로 증명한다."""

    def __init__(self):
        self.n = 0

    def call(self, model, system, messages, tools):
        self.n += 1
        if self.n == 1:
            content = [{"type": "tool_use", "id": "m1", "name": "read_file",
                        "input": {"path": "README.md"}}]
        else:
            content = [{"type": "tool_use", "id": "m2", "name": "done",
                        "input": {"summary": "목"}}]
        return {"content": content,
                "usage": {"input_tokens": 0, "output_tokens": 0}}


def _run_goodhart(config: ServiceConfig) -> None:
    """하루 한 번 Goodhart 계측 (docs/goodhart-metric-design.md). 결과는
    data/goodhart/와 로그에만 - 모델·프롬프트에는 가지 않는다."""
    argv = [sys.executable, os.path.join(ROOT_DIR, "tools", "goodhart.py"),
            "--tags", config.tag]
    if config.mock:
        argv.append("--no-github")
    try:
        r = subprocess.run(argv, cwd=ROOT_DIR, capture_output=True,
                           text=True, encoding="utf-8", errors="replace",
                           timeout=600)
        tail = (r.stdout or "").strip().splitlines()
        log.info("goodhart rc=%s %s", r.returncode,
                 " | ".join(t for t in tail if t.startswith(("ALARM", '"G_'))
                            or "G_a" in t)[:300])
    except Exception as exc:                     # noqa: BLE001
        log.error("goodhart 실행 실패: %s", str(exc)[:200])


def _idle(store: Store) -> bool:
    """큐가 비었거나(대기·임대 0) 감사 정지로 더 진행할 수 없으면 유휴."""
    if engine_halted(store):
        return True
    c = store.counts()
    return not c.get("pending") and not c.get("leased")


def serve(config: ServiceConfig, client_factory=None,
          stop_after: float | None = None,
          install_signals: bool = True) -> int:
    """Run until SIGTERM (or `stop_after` seconds, for tests; or the
    queue drains when exit_when_idle). Returns the number of supervisor
    ticks completed. 다중 저장소 모드면 저장소마다 엔진 하나 - 감사
    정지·예산·원장은 저장소 단위로 독립이다."""
    setup_logging(config)
    if config.mock:
        # 목 모드: 모델 호출은 전부 가짜, 인테이크도 목 - 지출 경로 없음
        import genesis.rookery.engine.agentic as ag
        ag.CALLER_FACTORY = lambda: MockCaller()
        config.intake_mock = True
        if client_factory is None:
            client_factory = lambda: None           # noqa: E731
        log.info("목 모드 - 모델 호출 가짜, 지출 0")
    problems = config.validate(require_api=client_factory is None)
    if problems:
        for p in problems:
            log.error("설정 오류: %s", p)
        log.error("서비스 시작 거부 - 위 오류 해결 필요")
        return -1

    names = list(config.repo_names) if config.multi else [None]
    units = []                      # (name, store, guard, reporter, engine)
    for name in names:
        store, guard, auditor, reporter, engine = build_engine(
            config, client_factory, name=name)
        info = engine.startup_recovery()
        log.info("시작 복구%s: 재개=%s 예약회수=%d 워크트리정리=%s 보고=%s",
                 f"[{name}]" if name else "", info["requeued"],
                 info["reservations"], info["workspaces"],
                 info["reports"])
        units.append((name or "", store, guard, reporter, engine))

    def stop_all():
        for _, _, _, _, eng in units:
            eng.stop()

    def _handle(signum, frame):
        log.info("신호 %s 수신 - 정지", signum)
        stop_all()

    if install_signals:
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                signal.signal(sig, _handle)
            except (ValueError, OSError):
                pass                   # not the main thread

    workers = []
    for name, _, _, _, engine in units:
        for i in range(config.workers):
            t = threading.Thread(target=engine.run_worker, daemon=True,
                                 name=f"rookery-{name or 'w'}{i}")
            t.start()
            workers.append(t)
    log.info("워커 %d개 시작 (모델=%s, 저장소=%s)", len(workers),
             config.model,
             ",".join(config.repo_names) if config.multi else config.repo)

    ticks = 0
    deadline = (time.time() + stop_after) if stop_after else None
    next_intake = time.time() if config.intake_interval_s > 0 else None
    next_goodhart = (time.time() + 300 if config.goodhart_interval_s > 0
                     else None)
    intake_thread: threading.Thread | None = None
    first = units[0][4]
    while not first.stopped:
        if next_intake is not None and time.time() >= next_intake:
            # 인테이크는 몇 분 걸린다(스캔+헤드 실행) - 감독 루프를
            # 막지 않게 스레드로; 이전 것이 아직 돌면 이번 회차는 건너뜀
            if intake_thread is None or not intake_thread.is_alive():
                intake_thread = threading.Thread(
                    target=_run_intake, args=(config,), daemon=True,
                    name="rookery-intake")
                intake_thread.start()
            else:
                log.info("인테이크 건너뜀 - 이전 실행 진행 중")
            next_intake = time.time() + config.intake_interval_s
        for name, store, guard, reporter, engine in units:
            _heartbeat(engine, guard, store, reporter, name)
        if next_goodhart is not None and time.time() >= next_goodhart:
            threading.Thread(target=_run_goodhart, args=(config,),
                             daemon=True, name="rookery-goodhart").start()
            next_goodhart = time.time() + config.goodhart_interval_s
        ticks += 1
        if deadline is not None and time.time() >= deadline:
            stop_all()
            break
        if config.exit_when_idle and ticks >= 2 and \
                all(_idle(store) for _, store, _, _, _ in units):
            log.info("큐 비움 - 유휴 종료")
            stop_all()
            break
        wait = config.tick_seconds
        if deadline is not None:
            wait = min(wait, max(deadline - time.time(), 0.01))
        first.wait_stop(wait)

    for t in workers:
        t.join(timeout=30)
    for _, store, _, _, _ in units:
        store.close()
    log.info("정지 완료 (틱 %d회)", ticks)
    return ticks


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(prog="rookery.alpha")
    parser.add_argument("--check", action="store_true",
                        help="설정 검증만 하고 종료")
    parser.add_argument("--report", action="store_true",
                        help="오늘 보고 미리보기 출력 후 종료")
    args = parser.parse_args(argv)
    config = ServiceConfig.from_env()

    if args.check:
        problems = config.validate()
        for p in problems:
            print("설정 오류:", p)
        print("검증 통과" if not problems else "검증 실패")
        return 0 if not problems else 1
    if args.report:
        paths = ([(n, config.repo_db_path(n)) for n in config.repo_names]
                 if config.multi else [("", config.db_path())])
        for name, path in paths:
            store = Store(path)
            guard = BudgetGuard(store, config.budget_policy())
            if name:
                print(f"===== {name}")
            print(DailyReporter(store, guard).preview())
            store.close()
        return 0
    stop_after = config.stop_after_s or None
    return 0 if serve(config, stop_after=stop_after) >= 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
