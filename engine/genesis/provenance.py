"""출처 계약 v0 구현 (docs/provenance-contract.md의 기계 판정부).

계약 문서가 규범이고 이 모듈은 그 실행이다. 의미 확장 금지 —
필드 추가·규칙 변경은 문서 개정 + 골든 케이스 갱신이 먼저다.

골든 케이스(tests/fixtures/provenance/)를 전부 통과하기 전에는
실제 로그·문서에 붙이지 않는다 (1개월차 2주차 규칙).

계약 8항 주의: 이 모듈의 출력(장부·상태)은 제안기 프롬프트에
주입하지 않는다. 운영 상태이지 컨텍스트가 아니다.
"""

from __future__ import annotations

from dataclasses import dataclass, field

HEADER_FIELDS = ("source_id", "source_kind", "parent_ids",
                 "parent_hash", "as_of", "generator", "status")
PROMOTION_FIELDS = ("claim_id", "text", "source_id",
                    "source_locator", "parent_hash", "promoted_at",
                    "verifier", "status")

FRESH, STALE, UNKNOWN = "fresh", "stale", "unknown"
RAW, DERIVED, NORMATIVE = "raw", "derived", "normative"


@dataclass
class Verdict:
    status: str
    in_aggregate: bool
    recheck_queue: bool = False
    violation: str | None = None
    verifier: str | None = None
    detail: dict = field(default_factory=dict)


def _hashes_of(header: dict) -> dict[str, str]:
    """parent_hash 필드 정규화: 단일 부모는 str, 다중 부모는
    {parent_id: hash}. v0은 두 형태만 안다."""
    ph = header.get("parent_hash")
    parents = header.get("parent_ids") or []
    if isinstance(ph, dict):
        return ph
    if len(parents) == 1:
        return {parents[0]: ph}
    return {}


def classify_document(header: dict | None,
                      current_parent_hashes: dict[str, str],
                      last_event_at: str | None = None) -> Verdict:
    """계약 1~3항 판정.

    - 헤더 없음 -> unknown (1항, 예외 없음)
    - raw: as_of != 마지막 이벤트 시각 -> 2항 위반, unknown 강등
    - derived: 부모 해시 불일치 -> stale (재확인 큐);
      부모의 현재 해시를 모름 -> unknown
    """
    if not header:
        return Verdict(UNKNOWN, in_aggregate=False)
    missing = [f for f in HEADER_FIELDS if f not in header]
    if missing:
        return Verdict(UNKNOWN, in_aggregate=False,
                       violation=f"계약 1항: 헤더 필드 누락 {missing}")

    kind = header["source_kind"]
    if kind == NORMATIVE:
        # v0.1 §5: 규범은 부모가 없다 - 있으면 파생을 규범으로 위장한 것
        if header.get("parent_ids") or header.get("parent_hash"):
            return Verdict(UNKNOWN, in_aggregate=False,
                           violation="계약 1항: 규범 문서는 부모를 갖지 "
                                     "않는다 (파생이면 derived로)")
        return Verdict(FRESH, in_aggregate=False,
                       detail={"kind": NORMATIVE})
    if kind == "raw":
        if last_event_at is not None and \
                header["as_of"] != last_event_at:
            return Verdict(
                UNKNOWN, in_aggregate=False, recheck_queue=True,
                violation="계약 2항: raw as_of != 마지막 이벤트 시각")
        return Verdict(FRESH, in_aggregate=True)

    if kind == "derived":
        seen = _hashes_of(header)
        parents = header.get("parent_ids") or []
        if not parents or not seen:
            return Verdict(UNKNOWN, in_aggregate=False,
                           violation="계약 1항: 부모 명시 없음")
        for pid in parents:
            cur = current_parent_hashes.get(pid)
            if cur is None:
                return Verdict(UNKNOWN, in_aggregate=False,
                               recheck_queue=True,
                               detail={"missing_parent": pid})
            if seen.get(pid) != cur:
                return Verdict(STALE, in_aggregate=True,
                               recheck_queue=True,
                               detail={"changed_parent": pid})
        return Verdict(FRESH, in_aggregate=True)

    return Verdict(UNKNOWN, in_aggregate=False,
                   violation=f"미정의 source_kind: {kind}")


def classify_promotion(record: dict,
                       current_parent_hashes: dict[str, str]
                       ) -> Verdict:
    """승격 레코드 판정. verifier 부재는 유효하되 'none' 표시
    유지 (confidence 유도는 장부 v0 범위 - 여기서 안 한다)."""
    missing = [f for f in PROMOTION_FIELDS if f not in record]
    if missing:
        return Verdict(UNKNOWN, in_aggregate=False,
                       violation=f"계약 1항: 레코드 필드 누락 {missing}")
    verifier = record.get("verifier") or "none"
    cur = current_parent_hashes.get(record["source_id"])
    if cur is None:
        return Verdict(UNKNOWN, in_aggregate=False,
                       recheck_queue=True, verifier=verifier)
    if record["parent_hash"] != cur:
        return Verdict(STALE, in_aggregate=True, recheck_queue=True,
                       verifier=verifier)
    return Verdict(FRESH, in_aggregate=True, verifier=verifier)


def aggregate(verdicts: list[Verdict]) -> dict:
    """계약 4·6항: unknown은 분모 제외, 비율은 상시 산출."""
    n = len(verdicts)
    normative = sum(1 for v in verdicts
                    if v.detail.get("kind") == NORMATIVE)
    fresh = sum(1 for v in verdicts if v.status == FRESH
                and v.detail.get("kind") != NORMATIVE)
    stale = sum(1 for v in verdicts if v.status == STALE)
    unknown = sum(1 for v in verdicts if v.status == UNKNOWN)
    denom = fresh + stale                     # v0.1: 규범은 분모 제외
    return {
        "total": n, "fresh": fresh, "stale": stale,
        "unknown": unknown, "normative": normative,
        "denominator": denom,
        "stale_rate": round(stale / denom, 4) if denom else None,
        "unknown_rate": round(unknown / n, 4) if n else None}
