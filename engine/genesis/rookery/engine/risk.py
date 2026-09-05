"""Alpha engine: risk assessment and candidate planning (step 6).

Spec: low risk 1 candidate, medium up to 2, high up to 3, and from
40,000 KRW every task drops to 1. Three failures end the task rather
than starting a fourth.

Why risk-based rather than a fixed count. A single candidate fixates
on the first hypothesis - that is exactly the wrong-file lock the
research series spent three experiments on (§6.9-§6.11), and it only
opened when candidates got structurally different inputs. But the
measured budget is roughly 100 calls a day, so three candidates
everywhere buys fixation-insurance on tasks that never needed it.
Spend the variance where the uncertainty actually is.

Risk here is **mechanical**, not a model's opinion: does a reproducing
test exist, is the location pinned, how wide is the blast radius, has
this task already failed. Those are the same signals §8.5 used to
draw the product boundary - work with a clear, checkable spec is low
risk precisely because the validator can settle it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

LOW, MEDIUM, HIGH = "low", "medium", "high"

# change kinds ordered by how much can go wrong
KIND_WEIGHT = {"doc": 0, "format": 0, "test": 1, "code": 2,
               "multi": 3}


@dataclass
class RiskSignals:
    """Everything is observable before any model call."""

    has_repro_test: bool = False
    located_file: bool = False
    located_symbol: bool = False
    covered_by_tests: bool = False
    files_in_scope: int = 1
    prior_attempts: int = 0
    change_kind: str = "code"
    spec_is_checkable: bool = True     # §8.5 product boundary

    @classmethod
    def from_payload(cls, payload: dict,
                     prior_attempts: int = 0) -> "RiskSignals":
        return cls(
            has_repro_test=bool(payload.get("test_id")),
            located_file=bool(payload.get("file")),
            located_symbol=bool(payload.get("symbol")),
            covered_by_tests=bool(payload.get("covered_by_tests",
                                              payload.get("test_id"))),
            files_in_scope=int(payload.get("files_in_scope", 1) or 1),
            prior_attempts=prior_attempts,
            change_kind=payload.get("change_kind", "code"),
            spec_is_checkable=bool(payload.get("spec_is_checkable",
                                               True)))


@dataclass
class RiskAssessment:
    level: str
    reasons: list[str] = field(default_factory=list)
    blocked: bool = False
    block_reason: str = ""


def assess(s: RiskSignals) -> RiskAssessment:
    reasons: list[str] = []

    # the product boundary: unverifiable work is not automated at all
    if not s.spec_is_checkable:
        return RiskAssessment(
            HIGH, ["명세가 기계 판정 불가"], blocked=True,
            block_reason="검증 불가능한 작업은 Alpha 자동화 대상 아님 "
                         "(§8.5 제품 경계)")

    high_flags = []
    if not s.has_repro_test:
        high_flags.append("재현 테스트 없음")
    if not s.covered_by_tests:
        high_flags.append("기존 테스트 커버리지 없음")
    if s.prior_attempts >= 2:
        high_flags.append(f"이전 시도 {s.prior_attempts}회 실패")
    if s.files_in_scope >= 3:
        high_flags.append(f"수정 대상 {s.files_in_scope}파일")
    if KIND_WEIGHT.get(s.change_kind, 2) >= 3:
        high_flags.append(f"변경 유형 {s.change_kind}")
    if high_flags:
        return RiskAssessment(HIGH, high_flags)

    low_ok = (s.has_repro_test and s.located_file and s.located_symbol
              and s.covered_by_tests and s.files_in_scope == 1
              and s.prior_attempts == 0
              and KIND_WEIGHT.get(s.change_kind, 2) <= 1)
    if low_ok:
        reasons.append("재현 테스트·위치 특정·단일 파일·"
                       f"변경 유형 {s.change_kind}")
        return RiskAssessment(LOW, reasons)

    if not s.located_symbol:
        reasons.append("심볼 미특정")
    if s.prior_attempts == 1:
        reasons.append("이전 시도 1회 실패")
    if s.files_in_scope == 2:
        reasons.append("수정 대상 2파일")
    if KIND_WEIGHT.get(s.change_kind, 2) == 2:
        reasons.append("코드 변경")
    return RiskAssessment(MEDIUM, reasons or ["기본값"])


@dataclass
class CandidatePlan:
    candidates: int
    risk: str
    stage: str
    deferred: bool = False
    reason: str = ""
    stop_after_all_fail: bool = True
    reasons: list[str] = field(default_factory=list)


def plan_candidates(signals: RiskSignals, guard, store=None,
                    task_id: str | None = None) -> CandidatePlan:
    """Risk decides the ceiling; the budget stage lowers it. A
    high-risk task is deferred rather than shrunk once high-cost work
    is restricted, because running it with one candidate is the
    fixation case we already know fails."""
    a = assess(signals)
    status = guard.status()
    stage = status.stage

    if a.blocked:
        plan = CandidatePlan(0, a.level, stage, deferred=True,
                             reason=a.block_reason, reasons=a.reasons)
    elif a.level == HIGH and not guard.policy.allows_high_cost(stage):
        plan = CandidatePlan(
            0, a.level, stage, deferred=True,
            reason=f"예산 단계 {stage} - 고위험(고비용) 작업 보류",
            reasons=a.reasons)
    else:
        plan = CandidatePlan(guard.max_candidates(a.level), a.level,
                             stage, reasons=a.reasons)

    if store is not None:
        store.log(task_id, None, "candidate_plan", {
            "risk": plan.risk, "stage": plan.stage,
            "candidates": plan.candidates,
            "deferred": plan.deferred, "reason": plan.reason,
            "reasons": plan.reasons})
    return plan
