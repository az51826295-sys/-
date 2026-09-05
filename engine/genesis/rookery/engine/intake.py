"""Alpha engine: failure log -> reproducible task intake (step 5).

    실패 발생 -> 재현 가능성 -> 평가기 정상 -> 중복 확인
             -> 해결 가능성·가치 -> 신규 과제 등록

Feeding the failure log straight back in is how a self-improving loop
teaches itself its own instrument bugs. Three of the research
series' most expensive detours were failures that looked exactly like
work: a discriminator that could never discriminate, a parser that
emptied every set, a stale list that readmitted spent tasks. None of
them were tasks. They were broken measurement.

So a failure becomes a task only by surviving five gates, and the
categories that can never be tasks are refused before any of them:

  transient API errors  - retrying is the fix, not patching
  credit / auth / budget - money and keys, not code
  audit disagreements   - the instrument is suspect; a human looks
  environment failures  - the box is wrong, not the repo
  flaky tests           - a failure that does not reproduce is not
                          evidence of a defect

Every refusal is logged with its gate, so "why did the engine not
pick this up" is answerable after the fact.
"""

from __future__ import annotations

import hashlib
import re
import time
from dataclasses import dataclass, field
from typing import Callable

# gates
G_CATEGORY = "g0_category"
G_REPRO = "g1_reproducible"
G_EVALUATOR = "g2_evaluator_sane"
G_DUPLICATE = "g3_duplicate"
G_VALUE = "g4_actionable_value"
G_REGISTERED = "g5_registered"

# failure sources that can never become tasks
NEVER_TASK = frozenset({
    "api_transient", "api_credit", "api_auth", "budget_stop",
    "audit_disagree", "env_setup_fail", "policy_blocked",
})

_NOISE = (
    (re.compile(r"0x[0-9a-fA-F]+"), "0xADDR"),
    (re.compile(r"\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}\S*"), "TS"),
    (re.compile(r"[A-Za-z]:\\[^\s'\"]+|/tmp/[^\s'\"]+"), "PATH"),
    (re.compile(r"line \d+"), "line N"),
    (re.compile(r"\b\d+\.\d+s\b"), "Ns"),
    (re.compile(r"\b\d+\b"), "N"),
)


def normalize(message: str) -> str:
    out = message.strip()
    for pat, repl in _NOISE:
        out = pat.sub(repl, out)
    return " ".join(out.split())[:400]


@dataclass
class FailureRecord:
    source: str                     # test | runtime | api | audit
    kind: str                       # classification (see NEVER_TASK)
    message: str
    task_id: str | None = None
    test_id: str | None = None
    file: str | None = None
    occurrences: int = 1
    occurred_at: float = field(default_factory=time.time)
    meta: dict = field(default_factory=dict)
    # merged into the enqueued task so a handler gets a ready payload
    # (repro_tests, smoke_tests, issue, focus_symbols, risk keys). The
    # intake gates never read this - it is pure carry-through.
    task_payload: dict = field(default_factory=dict)
    # the handler dispatch key for the enqueued task. Distinct from
    # `kind`, which classifies the FAILURE. Defaults to a kind with no
    # handler, so a failure is only made runnable when a seeder that
    # knows how to fix it sets this (e.g. "fix").
    task_kind: str = "fix_failure"

    def signature(self) -> str:
        raw = "|".join([self.source, self.kind, self.test_id or "",
                        self.file or "", normalize(self.message)])
        return hashlib.sha256(raw.encode()).hexdigest()[:16]


@dataclass
class ReproResult:
    reproduced: bool
    runs: int = 0
    failures: int = 0
    flaky: bool = False
    detail: str = ""


@dataclass
class IntakeDecision:
    admitted: bool
    gate: str
    code: str
    reason: str
    signature: str = ""
    task_id: str | None = None
    score: float = 0.0


@dataclass
class IntakeConfig:
    repro_runs: int = 3
    require_all_runs_fail: bool = True   # flaky -> not a task
    min_score: float = 1.0
    in_scope_prefixes: tuple[str, ...] = ()
    max_open_tasks: int = 50


class FailureIntake:
    """`reproduce` and `evaluator_ok` are injected so the pipeline is
    testable without a repo, and so a future executor can supply the
    real ones without touching the gate logic."""

    def __init__(self, store, config: IntakeConfig | None = None,
                 reproduce: Callable[[FailureRecord], ReproResult]
                 | None = None,
                 evaluator_ok: Callable[[FailureRecord],
                                        tuple[bool, str]] | None = None):
        self.store = store
        self.config = config or IntakeConfig()
        self._reproduce = reproduce
        self._evaluator_ok = evaluator_ok

    # ----------------------------------------------------------- gates

    def _g0_category(self, f: FailureRecord) -> IntakeDecision | None:
        if f.kind in NEVER_TASK:
            return IntakeDecision(
                False, G_CATEGORY, f.kind,
                f"{f.kind}은(는) 과제가 될 수 없는 범주 "
                f"(코드 결함이 아님)", f.signature())
        return None

    def _g1_repro(self, f: FailureRecord) -> IntakeDecision | None:
        if self._reproduce is None:
            return IntakeDecision(
                False, G_REPRO, "no_reproducer",
                "재현기가 없어 재현 가능성을 확인할 수 없음",
                f.signature())
        r = self._reproduce(f)
        if not r.reproduced:
            return IntakeDecision(
                False, G_REPRO, "not_reproducible",
                f"재현 실패 ({r.failures}/{r.runs}) - 일시적 현상",
                f.signature())
        if self.config.require_all_runs_fail and \
                (r.flaky or (r.runs and r.failures < r.runs)):
            return IntakeDecision(
                False, G_REPRO, "flaky",
                f"간헐적 실패 ({r.failures}/{r.runs}) - 결함 증거로 "
                f"불충분", f.signature())
        return None

    def _g2_evaluator(self, f: FailureRecord) -> IntakeDecision | None:
        if f.meta.get("all_tests_errored"):
            return IntakeDecision(
                False, G_EVALUATOR, "evaluator_broken",
                "모든 테스트가 error - 평가 환경 문제", f.signature())
        if f.meta.get("reference_fails"):
            return IntakeDecision(
                False, G_EVALUATOR, "test_invalid",
                "정답 상태에서도 실패하는 테스트 - 테스트가 무효",
                f.signature())
        if self._evaluator_ok is not None:
            ok, why = self._evaluator_ok(f)
            if not ok:
                return IntakeDecision(
                    False, G_EVALUATOR, "evaluator_unhealthy",
                    f"평가기 이상: {why}", f.signature())
        return None

    def _g3_duplicate(self, f: FailureRecord) -> IntakeDecision | None:
        sig = f.signature()
        existing = self.store.get(self._task_id(sig))
        if existing:
            self.store.log(existing["id"], None,
                           "intake_duplicate_seen", {"signature": sig})
            return IntakeDecision(
                False, G_DUPLICATE, "duplicate",
                f"동일 서명의 과제가 이미 있음 "
                f"({existing['id']}, 상태 {existing['state']})",
                sig, task_id=existing["id"])
        return None

    def _g4_value(self, f: FailureRecord) -> IntakeDecision | None:
        score, why = self.score(f)
        if score < self.config.min_score:
            return IntakeDecision(
                False, G_VALUE, "not_actionable",
                f"해결 가능성·가치 부족 (점수 {score:.1f}: {why})",
                f.signature(), score=score)
        if self.store.pending_count() >= self.config.max_open_tasks:
            return IntakeDecision(
                False, G_VALUE, "queue_full",
                f"대기 과제 {self.config.max_open_tasks}건 상한 도달",
                f.signature(), score=score)
        return None

    def score(self, f: FailureRecord) -> tuple[float, str]:
        """Actionability first, then value. A failure with no located
        file or test is not something a patch can target."""
        points, why = 0.0, []
        if f.file:
            points += 1.0
            why.append("파일 특정")
        if f.test_id:
            points += 1.0
            why.append("테스트 특정")
        if f.occurrences > 1:
            points += min(f.occurrences, 5) * 0.2
            why.append(f"{f.occurrences}회 발생")
        if self.config.in_scope_prefixes:
            target = (f.file or "").replace("\\", "/")
            if not any(target.startswith(p)
                       for p in self.config.in_scope_prefixes):
                points -= 2.0
                why.append("범위 밖 경로")
        if f.meta.get("dependency"):
            points -= 2.0
            why.append("외부 의존성 문제")
        return points, ", ".join(why) or "근거 없음"

    # ------------------------------------------------------- pipeline

    def _task_id(self, signature: str) -> str:
        return f"intake-{signature}"

    def submit(self, f: FailureRecord,
               priority: int = 0) -> IntakeDecision:
        for gate in (self._g0_category, self._g1_repro,
                     self._g2_evaluator, self._g3_duplicate,
                     self._g4_value):
            decision = gate(f)
            if decision is not None:
                self.store.log(f.task_id, None, "intake_rejected", {
                    "gate": decision.gate, "code": decision.code,
                    "reason": decision.reason,
                    "signature": decision.signature})
                return decision

        sig = f.signature()
        task_id = self._task_id(sig)
        score, why = self.score(f)
        payload = {"signature": sig, "source": f.source,
                   "kind": f.kind, "message": f.message[:1000],
                   "test_id": f.test_id, "file": f.file,
                   "occurrences": f.occurrences,
                   "origin_task": f.task_id, "score": score,
                   "rationale": why}
        payload.update(f.task_payload)     # handler-ready enrichment
        self.store.add_task(
            task_id, kind=f.task_kind, priority=priority,
            payload=payload)
        self.store.log(task_id, None, "intake_admitted", {
            "signature": sig, "score": score, "why": why,
            "origin_task": f.task_id})
        return IntakeDecision(True, G_REGISTERED, "admitted",
                              f"과제 등록 (점수 {score:.1f}: {why})",
                              sig, task_id=task_id, score=score)

    # --------------------------------------------------------- report

    def rejection_summary(self, limit: int = 1000) -> dict[str, int]:
        """Feeds the daily report: why intake refused things."""
        out: dict[str, int] = {}
        for e in self.store.events("intake_rejected", limit=limit):
            import json

            code = json.loads(e["data"]).get("code", "?")
            out[code] = out.get(code, 0) + 1
        return dict(sorted(out.items(), key=lambda kv: -kv[1]))
