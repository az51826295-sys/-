"""상태 장부 v0 — 공통 상위 스키마 (docs/ledger-boardgame-rules.md).

계약 8항: 이 장부는 운영 상태(확정 사실·차단 목록·롤백 대상)다.
제안기 프롬프트에 주입하지 않는다.

공통 상위는 도메인을 모른다: 서명 문자열 3개(해상도별)와 행동,
국면, 검증된 실패만 다룬다. 도메인(보드게임, 코드 레인)은 서명
계산기와 실패 판정을 공급한다. `signature_equal`은 v0에서 완전
일치다 - 근사 매칭 없음.
"""

from __future__ import annotations

from dataclasses import dataclass, field

RESOLUTIONS = ("full", "local", "stat")
BLOCK, PENALIZE, CONDITIONAL, RELEASE = (
    "BLOCK", "PENALIZE", "CONDITIONAL", "RELEASE")

BLOCK_AT = 3          # 검증된 실패 누적 문턱 (동결)
PENALIZE_AT = 2


@dataclass(frozen=True)
class LookupKey:
    resolution: str
    state_signature: str
    phase: str
    action: str


def signature_equal(a: str, b: str) -> bool:
    """v0: 완전 일치. 이 함수가 인터페이스인 이유는 도메인·버전에
    따라 근사 매칭으로 확장될 자리이기 때문이다 - 확장은 규칙
    문서 개정을 먼저 거친다."""
    return a == b


# verifier -> confidence 기계 유도 (v0 동결 사상). 숫자가 아니라
# 서열이다 - 가짜 정밀도를 만들지 않는다.
VERIFIER_CONFIDENCE = {
    "machine": "high",     # 기계 오라클 (테스트 fail->pass 등)
    "replay": "high",      # 결정론 재실행으로 재확인
    "judge": "medium",     # 사후 판정기 점수
    "none": "low",         # 미검증 주장
}


@dataclass
class LedgerEntry:
    key: LookupKey
    seen: int = 0
    verified_failures: int = 0
    unverified_failures: int = 0
    verifier: str = "none"
    rollback_target: str | None = None
    evidence: list = field(default_factory=list)

    @property
    def confidence(self) -> str:
        """confidence는 verifier에서만 유도된다 - 손으로 넣는
        필드가 아니다 (2개월차 4주차 동결)."""
        return VERIFIER_CONFIDENCE.get(self.verifier, "low")

    def disposition(self) -> str:
        """규칙 3의 기계 판정. BLOCK은 rollback_target 없이는
        성립하지 않는다 - 그 경우 승인 큐 표기로 강등된다.
        미검증 실패(unverified)는 사다리에 오르지 못한다:
        confidence low인 실패 주장으로 차단하는 것은 계측 없는
        개입이다."""
        if self.verified_failures >= BLOCK_AT:
            return BLOCK if self.rollback_target else "APPROVAL_QUEUE"
        if self.verified_failures >= PENALIZE_AT:
            return PENALIZE
        if self.verified_failures >= 1:
            return CONDITIONAL
        return "NONE"


class StateLedger:
    """키 → 엔트리. 기록과 조회만 있고 판단은 disposition()에만."""

    def __init__(self) -> None:
        self._entries: dict[LookupKey, LedgerEntry] = {}

    def lookup(self, key: LookupKey) -> LedgerEntry | None:
        # v0의 signature_equal이 완전 일치이므로 dict 조회와 동치다.
        # 근사 매칭 도입 시 이 자리가 선형 탐색으로 바뀐다 (규칙
        # 문서 개정 선행).
        return self._entries.get(key)

    def record(self, key: LookupKey, failed: bool,
               rollback_target: str | None,
               evidence: str = "",
               verifier: str = "judge") -> LedgerEntry:
        """verifier 기본값 judge: 보드게임 표의 실패 신호가 사후
        판정기에서 오기 때문. verifier='none'인 실패는 미검증
        칸에만 쌓이고 disposition 사다리에 오르지 않는다."""
        e = self._entries.get(key)
        if e is None:
            e = LedgerEntry(key=key)
            self._entries[key] = e
        e.seen += 1
        e.verifier = verifier
        if failed:
            if verifier == "none":
                e.unverified_failures += 1
            else:
                e.verified_failures += 1
        if rollback_target:
            e.rollback_target = rollback_target
        if evidence:
            e.evidence.append(evidence[:200])
        return e

    def release(self, key: LookupKey) -> None:
        """국소 변화에 의한 해제 (시간 경과 해제 없음)."""
        e = self._entries.get(key)
        if e is not None:
            e.verified_failures = 0

    def __len__(self) -> int:
        return len(self._entries)
