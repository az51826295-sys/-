"""장부 v0 + 보드게임 서명 단위 검사 (표 생성 전 필수)."""

from genesis.ledger.boardgame import (
    full_sig, local_sig, machine_columns, phase_of, spec_hash,
    stat_sig)
from genesis.ledger.state import LedgerEntry, LookupKey, StateLedger


def test_spec_hash_ignores_identity_fields():
    a = '{"spec_id": "s1", "name": "게임A", "design_intent": "x", "board": {"w": 5}}'
    b = '{"spec_id": "s2", "name": "게임B", "design_intent": "y", "board": {"w": 5}}'
    c = '{"spec_id": "s1", "name": "게임A", "design_intent": "x", "board": {"w": 6}}'
    assert spec_hash(a) == spec_hash(b)
    assert spec_hash(a) != spec_hash(c)


def test_full_sig_order_invariant():
    board1 = [("h1", 0.5), ("h2", 0.7)]
    board2 = [("h2", 0.7), ("h1", 0.5)]
    assert full_sig(board1, "mid") == full_sig(board2, "mid")
    assert full_sig(board1, "mid") != full_sig(board1, "late")


def test_local_sig_propose_uses_board_buckets():
    s1 = local_sig(None, None, None, 0, board_best_bucket=14,
                   n_bucket=1)
    s2 = local_sig(None, None, None, 0, board_best_bucket=14,
                   n_bucket=2)
    assert s1 != s2
    t1 = local_sig("th", 0.71, "ph", 1, 14, 1)
    t2 = local_sig("th", 0.71, "ph", 1, 99, 9)   # 대상 있으면 보드 무관
    assert t1 == t2


def test_phase_thirds():
    assert phase_of(1, 12) == "early"
    assert phase_of(5, 12) == "mid"
    assert phase_of(9, 12) == "late"


def test_confidence_derives_from_verifier_only():
    e = LedgerEntry(key=LookupKey("local", "s", "mid", "MODIFY"))
    assert e.confidence == "low"
    e.verifier = "judge"
    assert e.confidence == "medium"
    e.verifier = "machine"
    assert e.confidence == "high"
    e.verifier = "직접입력한값"
    assert e.confidence == "low", "미정의 verifier는 low로 강등"


def test_unverified_failures_never_climb_the_ladder():
    led = StateLedger()
    k = LookupKey("local", "sig", "mid", "MODIFY")
    for _ in range(5):
        led.record(k, failed=True, rollback_target="p",
                   verifier="none")
    e = led.lookup(k)
    assert e.unverified_failures == 5
    assert e.verified_failures == 0
    assert e.disposition() == "NONE", \
        "미검증 실패 주장으로는 차단하지 않는다"


def test_disposition_ladder_and_rollback_gate():
    led = StateLedger()
    k = LookupKey("local", "sig", "mid", "MODIFY")
    led.record(k, failed=True, rollback_target=None)
    assert led.lookup(k).disposition() == "CONDITIONAL"
    led.record(k, failed=True, rollback_target=None)
    assert led.lookup(k).disposition() == "PENALIZE"
    led.record(k, failed=True, rollback_target=None)
    assert led.lookup(k).disposition() == "APPROVAL_QUEUE", \
        "rollback_target 없으면 BLOCK 불가 - 승인 큐"
    led.record(k, failed=False, rollback_target="prop-1")
    assert led.lookup(k).disposition() == "BLOCK"
    led.release(k)
    assert led.lookup(k).disposition() == "NONE"


def _row(sig, action="MODIFY", failed=False, run="C/1/0"):
    return {"run": run, "sig_full": sig, "sig_local": sig,
            "sig_stat": sig, "phase": "mid", "action": action,
            "failed": failed, "rollback_target": "p1"}


def test_machine_columns_rematch_and_block():
    rows = [_row("s1", failed=True), _row("s1", failed=True),
            _row("s1", failed=True), _row("s1"), _row("s2")]
    machine_columns(rows)
    assert not rows[0]["match_local"]
    assert rows[1]["match_local"] and rows[2]["match_local"]
    # 4번째 시도 시점: 실패 3회 누적 + rollback 있음 -> BLOCK
    assert rows[3]["blocked"] == "BLOCK"
    assert not rows[4]["match_local"] and rows[4]["blocked"] == "NONE"


def test_in_run_vs_global_match_separated():
    rows = [_row("s1", run="C/1/0"), _row("s1", run="C/2/0")]
    machine_columns(rows)
    assert rows[1]["match_local"] is True          # 전역 일치
    assert rows[1]["match_local_in_run"] is False  # 런 내 최초


def test_all_resolutions_recorded_not_just_local():
    """1차 구현의 자기 모순(전역 재매칭 < 런내 재매칭) 회귀 고정:
    해상도마다 서명이 달라도 full/stat 전역 일치가 잡혀야 한다."""
    r1 = {"run": "C/1/0", "sig_full": "F1", "sig_local": "L1",
          "sig_stat": "S1", "phase": "mid", "action": "MODIFY",
          "failed": False, "rollback_target": "p"}
    r2 = dict(r1, sig_local="L2")      # local만 다름
    rows = [r1, r2]
    machine_columns(rows)
    assert rows[1]["match_full"] is True
    assert rows[1]["match_stat"] is True
    assert rows[1]["match_local"] is False
    # 전역 ≥ 런내 불변식
    for res in ("full", "local", "stat"):
        assert sum(r[f"match_{res}"] for r in rows) >= \
            sum(r[f"match_{res}_in_run"] for r in rows)
