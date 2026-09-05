"""다양성 한계비용 곡선 v0 — 사전 등록 문서와 코드가 어긋나지 않게 막는다.

핵심 이빨: **모든 서명이 유일하면 flat이 아니라 undefined**다. 분해능이 없는
층위에서 "새것 비율 1.0"이 나오는 것은 다양성의 증거가 아니라 자(尺)가 짧다는
증거다. 이 구분이 무너지면 곡선은 자동으로 항상 "교체 불필요"를 말한다.
"""
import os

from tools import diversity_curve as dc

DESIGN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      "docs", "diversity-q1-v0-design.md")


def _svg(n_paths: int, seed: str = "a") -> str:
    body = "".join(
        f'<path d="M{i + 1} {i + 1} L{i + 2} {i + 2}"/>' for i in range(n_paths))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
            f'data-seed="{seed}">{body}</svg>')


def _concepts(n_concepts: int, per: int, duplicate: bool):
    """개념 n개 × 후보 per개. duplicate면 각 개념의 첫 둘을 같게 만든다."""
    out = []
    for c in range(n_concepts):
        svgs = [_svg(i + 1, seed=f"c{c}-{i}") for i in range(per)]
        if duplicate:
            svgs[1] = svgs[0]
        out.append({"run": "t", "concept": f"k{c}", "used_rounds": 1,
                    "n_passed": len(svgs), "missing": [], "svgs": svgs,
                    "run_pass_rate": 1.0})
    return out


def test_all_unique_is_undefined_not_flat():
    """이빨: 중복이 하나도 없으면 어떤 층위도 분해능이 없다 → undefined."""
    res = dc.analyse(_concepts(10, 6, duplicate=False))
    assert res["verdict"] == "undefined"
    assert res["why"] == "no_resolution_at_any_tier"
    assert res["tier_used"] is None
    # 표본 관문은 충족했는데도 undefined여야 한다 (관문 탓이 아니다).
    assert res["sample"]["gate_ok"] is True


def test_duplicates_give_resolution_and_pick_strictest_tier():
    res = dc.analyse(_concepts(10, 6, duplicate=True))
    assert res["tier_used"] == "T1"
    assert res["tiers"]["T1"]["has_resolution"] is True
    assert res["tiers"]["T1"]["duplicates"] == 10


def test_sample_gate_downgrades_to_undefined():
    """분해능이 있어도 개념이 모자라면 판정하지 않는다 — 관문을 낮추지 않는다."""
    res = dc.analyse(_concepts(3, 6, duplicate=True))
    assert res["sample"]["gate_ok"] is False
    assert res["verdict"] == "undefined"
    assert res["why"] == "sample_gate"


def test_short_concepts_are_excluded_with_reason():
    concepts = _concepts(8, 6, duplicate=True) + _concepts(1, 3, duplicate=True)
    res = dc.analyse(concepts)
    assert res["sample"]["concepts"] == 8
    assert any(e["reason"] == "per_concept_min"
               for e in res["sample"]["excluded"])


def test_good_turing_u():
    assert dc.good_turing_u(["a", "b", "c"]) == 1.0
    assert dc.good_turing_u(["a", "a", "b", "c"]) == 0.5
    assert dc.good_turing_u(["a", "a"]) == 0.0
    assert dc.good_turing_u([]) is None


def test_thresholds_match_the_registered_design():
    """문턱은 문서에서 왔다. 코드에서 조용히 바꾸면 여기서 걸린다."""
    text = open(DESIGN, encoding="utf-8").read()
    assert dc.FLAT_LOWER == 0.80 and "0.80" in text
    assert dc.SATURATING_UPPER == 0.50 and "0.50" in text
    assert dc.MIN_CONCEPTS == 8 and "개념 ≥ 8" in text
    assert dc.MIN_CANDIDATES == 40 and "통과 후보 ≥ 40" in text
    assert dc.MIN_PER_CONCEPT == 6 and "개념당 통과 후보 ≥ 6" in text


def test_signatures_are_coarser_down_the_ladder():
    """T1이 가르는 것을 T3가 합칠 수는 있어도 그 반대는 없다."""
    a, b = _svg(2, seed="x"), _svg(2, seed="y")
    sa, sb = dc.signatures(a), dc.signatures(b)
    assert sa["T3"] == sb["T3"]          # 같은 요소 구성
    assert sa["T2"] == sb["T2"]          # 같은 path_count/shape_count
    c = _svg(3, seed="x")
    assert dc.signatures(c)["T3"] != sa["T3"]
