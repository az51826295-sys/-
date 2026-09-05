"""예시 용량-반응 — 등록 문서와 코드가 어긋나지 않게 막는다.

이 실험이 거짓말이 되는 길은 둘이다: 예시로 준 자산의 개념을 시험 개념에도
넣거나(그러면 예시가 곧 정답이다), 뭉침을 무시하고 후보 단위로 구간을 잡거나
(그러면 구간이 실제보다 좁다 — 오늘 프롬프트 통제에서 한 실수다).
"""
import os

from tools import example_dose as ed
from tools import icon_judge
from tools import icon_lane_run as ilr

DESIGN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      "docs", "example-dose-v0-design.md")


def test_test_concepts_do_not_include_the_example_concepts():
    """예시가 곧 정답이면 순환이다 — attack·defend·shop은 시험에서 뺀다."""
    example_concepts = {g.split("_", 1)[1] for g in ed.EXAMPLE_GROUPS}
    test_concepts = {c["concept"] for c in ed.TEST_CONCEPTS}
    assert not (example_concepts & test_concepts), example_concepts & test_concepts
    assert len(test_concepts) >= ed.MIN_CONCEPTS


def test_each_arm_carries_exactly_its_dose_of_examples():
    doc = icon_judge.load_spec()
    pool = ed.load_examples()
    assert len(pool) == 3
    for dose in ed.DOSES:
        p = ilr.initial_prompt("quest", "퀘스트", "dose", 1, pool[:dose], doc, 6)
        assert p.count("<svg") == dose, f"{dose}개 팔에 {p.count('<svg')}개"


def _arm(rates: dict, per: int = 6) -> dict:
    """개념별 통과 개수를 지정해 합성 팔을 만든다."""
    rows = []
    for concept, passed in rates.items():
        for i in range(per):
            rows.append({"concept": concept,
                         "verdict": "PASS" if i < passed else "FAIL",
                         "violated": []})
    n_pass = sum(1 for r in rows if r["verdict"] == "PASS")
    return {"rows": rows, "n": len(rows), "passed": n_pass,
            "pass_rate": n_pass / len(rows), "concepts": sorted(rates),
            "why": None}


def test_the_bootstrap_resamples_concepts_not_candidates():
    """개념마다 통과가 뭉쳐 있으면 구간은 **넓어야** 한다."""
    lumpy = _arm({f"c{i}": (6 if i < 4 else 0) for i in range(8)})
    flat = _arm({f"c{i}": 3 for i in range(8)})
    lo, hi = ed._cluster_bootstrap(lumpy, flat)
    assert hi - lo > 0.3, f"뭉친 자료인데 구간이 좁다: [{lo}, {hi}]"
    same = ed._cluster_bootstrap(flat, flat)
    assert same[0] == same[1] == 0.0


def test_a_clear_dose_effect_is_named():
    arms = {"ex0": _arm({f"c{i}": 0 for i in range(9)}),
            "ex1": _arm({f"c{i}": 3 for i in range(9)}),
            "ex3": _arm({f"c{i}": 6 for i in range(9)})}
    j = ed.verdict(arms)
    assert j["verdict"] == "examples_carry_compliance"
    assert j["D"] == 1.0


def test_no_effect_is_named_too():
    arms = {k: _arm({f"c{i}": 6 for i in range(9)}) for k in ("ex0", "ex1", "ex3")}
    j = ed.verdict(arms)
    assert j["verdict"] == "examples_irrelevant"


def test_small_sample_is_undefined():
    arms = {k: _arm({f"c{i}": 6 for i in range(3)}) for k in ("ex0", "ex1", "ex3")}
    j = ed.verdict(arms)
    assert j["verdict"] == "undefined" and j["why"] == "sample_gate"


def test_thresholds_match_the_registered_design():
    text = open(DESIGN, encoding="utf-8").read()
    assert ed.CARRY_LOWER == 0.20 and "0.20" in text
    assert ed.IRRELEVANT_BAND == 0.05 and "±0.05" in text
    assert ed.MIN_CONCEPTS == 8 and "개념 ≥ 8" in text
    assert ed.MIN_PER_ARM == 40 and "팔당 후보 ≥ 40" in text
    assert ed.DOSES == (0, 1, 3)
