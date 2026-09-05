"""세트 판정 — 잰 규칙이 판정에 물려 있는지.

2026-08-27 00:2x에 발견한 것: 세트 시각 무게 폭이 0.1696으로 관문 0.15를
넘는데도 세트는 "8/8 통과"로 나왔다. **재고도 아무 데도 안 물린 규칙**은
장식이고, 장식은 다음에 조용히 사라진다.
"""
import glob
import os

import pytest

from genesis import icon_lane
from genesis import svg_raster
from tools import icon_judge

POOL = sorted(glob.glob(os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "out", "icons", "pick-v2", "candidates", "*", "c01.svg")))


def test_the_parser_no_longer_claims_unmeasured_on_its_own():
    """파서에는 렌더러가 없다. 그렇다고 '미측정'이라고 단정하면,
    실제로 잰 회차에도 미측정이라고 말하게 된다."""
    svgs = [open(p, encoding="utf-8").read() for p in POOL[:3]]
    cons = icon_lane.set_consistency(svgs)
    assert cons["optical_weight"] is None
    assert "렌더러" in cons["optical_weight_note"]


@pytest.mark.skipif(not svg_raster.available(), reason="래스터 없음")
def test_a_measured_set_rule_actually_bites():
    res = icon_judge.judge_set(POOL)
    rules = {r["rule"]: r for r in res["set_rules"]}
    assert "set.optical_weight_delta_max" in rules
    row = rules["set.optical_weight_delta_max"]
    assert row["got"] is not None, "재지도 않고 규칙만 있다"
    # 이 세트는 관문을 넘는다(2026-08-27 실측 0.1696 > 0.15)
    assert row["ok"] is False
    assert res["set_verdict"] == "FAIL"
    # 개별 아이콘은 전부 통과인데 세트가 떨어지는 것이 요점이다
    assert res["passed"] == res["total"]


def test_set_verdict_is_three_valued():
    """못 잰 규칙이 하나라도 있으면 FAIL이 아니라 UNDEFINED."""
    svgs = [open(p, encoding="utf-8").read() for p in POOL[:2]]
    # 세트가 2건이면 optical_weight_delta는 정의되지만, 래스터가 없는 기계에서는
    # None이 되고 그때 판정은 UNDEFINED여야 한다.
    res = icon_judge.judge_set(POOL[:2])
    assert res["set_verdict"] in ("PASS", "FAIL", "UNDEFINED")
    if any(r["ok"] is None for r in res["set_rules"]):
        assert res["set_verdict"] == "UNDEFINED"
    assert len(svgs) == 2


def test_every_set_rule_names_what_it_wanted():
    res = icon_judge.judge_set(POOL)
    for row in res["set_rules"]:
        assert row["rule"].startswith("set.")
        assert row["want"] is not None
