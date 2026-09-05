"""설계도 엔진 계약 — 약속이 조용히 커지거나 줄어들지 않게 막는다.

설계도는 두 층이다: 사람이 읽는 비전과 기계 체크리스트. 이 파일이 지키는 것은
**둘 사이에서 항목이 사라지지 않는 것**이다. 체크리스트에서 빠진 항목이
human_gate에도 없으면 "설계도대로 채점합니다"가 조용히 부풀려진다.
"""
from tools import blueprint_engine as be

REG = be.load_registry()


def _recon(want: str) -> dict:
    return be.reconstruct(be.intake(want, REG), REG)


ALL_REAL = {"keep": [a for a in REG if a["verdict"] == "real"], "drops": []}


def test_nothing_disappears_between_scope_and_the_two_lists():
    """keep = checklist ⊎ human_gate. 어느 쪽에도 없으면 그건 실종이다."""
    bp = be.blueprint(ALL_REAL, want="전부")
    scope = {a["id"] for a in ALL_REAL["keep"]}
    listed = {r["atom"] for r in bp["checklist"]}
    gated = {r["atom"] for r in bp["human_gate"]}
    assert listed | gated == scope, f"실종: {scope - (listed | gated)}"
    assert not (listed & gated), f"양쪽에 있다: {listed & gated}"


def test_every_listed_atom_is_a_registered_atom():
    bp = be.blueprint(ALL_REAL, want="전부")
    ids = {a["id"] for a in REG}
    for row in bp["checklist"] + bp["human_gate"]:
        assert row["atom"] in ids, row["atom"]


def test_coverage_is_the_ratio_it_claims_to_be():
    bp = be.blueprint(ALL_REAL, want="전부")
    keep_n = len(ALL_REAL["keep"])
    assert bp["vision"]["machine_coverage"] == round(
        len(bp["checklist"]) / keep_n, 4)
    if bp["checklist"]:
        reading = [r for r in bp["checklist"] if r["spec_sensitive"] is True]
        assert bp["vision"]["spec_sensitive_coverage"] == round(
            len(reading) / len(bp["checklist"]), 4)


def test_a_checklist_row_never_claims_teeth_it_does_not_have():
    """체크리스트에 오르는 자격은 넷이다(이빨·측정 재료·어댑터·설계도 읽기)."""
    bp = be.blueprint(ALL_REAL, want="전부")
    for row in bp["checklist"]:
        assert row["teeth"], f'{row["atom"]}: 이빨 없이 체크리스트에 올랐다'
        assert row["binding"] == "bound", row["atom"]
        assert row["spec_sensitive"] is not False, row["atom"]


def test_picking_more_never_costs_less():
    """단조성: 고른 것을 늘리면 코인이 줄지 않는다."""
    recon = ALL_REAL
    ids = [a["id"] for a in recon["keep"]]
    prev = 0
    for k in range(len(ids) + 1):
        total = be.estimate(recon, pick=ids[:k])["total_coins"]
        assert total >= prev, f"{k}개 고르니 코인이 줄었다: {total} < {prev}"
        prev = total


def test_the_estimate_never_hides_the_peg():
    """정직 조항: 코인만 보여주고 원 환산을 숨기지 않는다."""
    est = be.estimate(ALL_REAL)
    assert est["coin_to_won"] and est["won_equiv"] == est["total_coins"] * est["coin_to_won"]
    assert "자리표시" in est["disclaimer"]
    assert "미측정" in est["human_time"]


def test_selected_is_always_a_subset_of_recommended():
    est = be.estimate(ALL_REAL, pick=[a["id"] for a in ALL_REAL["keep"][:2]])
    rec = {r["atom"] for r in est["recommended"]}
    sel = {r["atom"] for r in est["selected"]}
    assert sel <= rec and len(sel) == 2


def test_picking_nothing_is_not_the_same_as_picking_everything():
    """빈 선택이 '전부'로 접히면, 아무것도 안 고른 견적이 전부 값으로 나간다."""
    everything = be.estimate(ALL_REAL)                 # 안 고르심(None)
    nothing = be.estimate(ALL_REAL, pick=[])           # 아무것도 안 고르심
    assert everything["total_coins"] > 0
    assert nothing["total_coins"] == 0
    assert nothing["picked_none"] is True
    assert everything["picked_none"] is False
    assert nothing["recommended"] == everything["recommended"]
