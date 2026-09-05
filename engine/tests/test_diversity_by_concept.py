"""개념별 다양성 판정 — 평균이 뭉갠 것을 개념별로 되살리되, 조용한 기본값을 막는다."""
from tools import diversity_by_concept as dbc


def _calls(pattern: list, per: int = 6) -> list:
    """pattern[k] = k번째 호출에서 **새로운** 서명의 개수(나머지는 재탕)."""
    calls, pool = [], []
    for i, fresh in enumerate(pattern):
        sigs = [f"new-{i}-{j}" for j in range(fresh)]
        sigs += [pool[j % len(pool)] for j in range(per - fresh)] if pool else []
        while len(sigs) < per:
            sigs.append(f"pad-{i}-{len(sigs)}")
        pool += sigs
        calls.append([{t: s for t in dbc.TIERS} for s in sigs])
    return calls


def test_a_concept_that_keeps_producing_is_flat():
    j = dbc.judge_concept(_calls([6] * 10), "T2")
    assert j["verdict"] == "flat" and j["mean_novelty"] == 1.0


def test_a_concept_that_runs_dry_is_saturating():
    j = dbc.judge_concept(_calls([6] + [0] * 9), "T2")
    assert j["verdict"] == "saturating"
    assert j["mean_novelty"] == 0.0


def test_too_few_calls_is_undefined():
    j = dbc.judge_concept(_calls([6] * 4), "T2")
    assert j["verdict"] == "undefined" and j["why"] == "sample_gate"


def test_chao1_counts_what_is_left():
    got = dbc.chao1(["a", "a", "b", "b", "c", "d"])
    assert got["observed"] == 4 and got["singletons"] == 2
    assert got["doubletons"] == 2
    assert got["chao1"] == 4 + (2 * 2) / (2 * 2)
    assert 0 < got["coverage"] <= 1


def _runs(verdicts: list) -> list:
    """원하는 판정이 나오도록 개념을 합성한다."""
    out = []
    for i, want in enumerate(verdicts):
        # flat도 천장(1.0)에 붙이지 않는다 — 붙이면 그 자는 분해능이 없고
        # 그건 §6이 막는 상황이다. 6개 중 5개가 새것 = 0.833.
        pattern = [6] + [5] * 9 if want == "flat" else [6] + [0] * 9
        out.append({"concept": f"c{i}", "source": "t", "why": None,
                    "calls": _calls(pattern)})
    return out


def test_a_tie_is_not_quietly_decided():
    """2 대 2로 갈리면 어느 쪽도 아니다 — 초안은 조용히 한쪽을 골랐다."""
    res = dbc.analyse(_runs(["flat", "flat", "saturating", "saturating"]))
    sv = res["tiers"][res["tier_used"]]["set_verdict"]
    assert sv["verdict"] == "undefined" and sv["why"] == "split"


def test_a_majority_names_the_set():
    res = dbc.analyse(_runs(["saturating"] * 3 + ["flat"]))
    sv = res["tiers"][res["tier_used"]]["set_verdict"]
    assert sv["verdict"] == "generator_limited"
    res2 = dbc.analyse(_runs(["flat"] * 3 + ["saturating"]))
    sv2 = res2["tiers"][res2["tier_used"]]["set_verdict"]
    assert sv2["verdict"] == "generator_fine"


def test_fewer_than_four_judged_concepts_is_undefined():
    res = dbc.analyse(_runs(["saturating", "saturating"]))
    sv = res["tiers"][res["tier_used"]]["set_verdict"]
    assert sv["verdict"] == "undefined" and sv["why"] == "set_sample_gate"


def test_thresholds_are_inherited_not_reinvented():
    from tools import diversity_curve as dcv
    assert dbc.FLAT_LOWER == dcv.FLAT_LOWER == 0.80
    assert dbc.SATURATING_UPPER == dcv.SATURATING_UPPER == 0.50


def test_a_ruler_pinned_at_the_ceiling_has_no_resolution(monkeypatch):
    """설계 §6: 중복 하나로 '가른다'가 되면 안 된다.

    개념 대부분이 새것 비율 1.0이고 한 개념만 아주 살짝 낮은 자료 — 초안 기준
    (중복>0)은 통과시켰고, 그 결과 세트 판정이 자동으로 generator_fine이었다.
    """
    runs = [{"concept": f"c{i}", "source": "t", "why": None,
             "calls": _calls([6] * 10)} for i in range(5)]
    # 마지막 개념에만 재탕 하나 — 중복은 생기지만 자는 여전히 천장에 붙어 있다
    runs.append({"concept": "c5", "source": "t", "why": None,
                 "calls": _calls([6] * 9 + [5])})
    res = dbc.analyse(runs)
    t2 = res["tiers"]["T2"]
    assert t2["duplicates"] > 0, "중복이 아예 없으면 이 시험이 무의미하다"
    assert t2["has_resolution"] is False, "천장에 붙은 자가 분해능을 얻었다"


def test_a_ruler_away_from_the_ceiling_keeps_its_resolution():
    runs = [{"concept": f"c{i}", "source": "t", "why": None,
             "calls": _calls([6] + [0] * 9)} for i in range(5)]
    res = dbc.analyse(runs)
    assert res["tier_used"] is not None
    assert res["tiers"][res["tier_used"]]["has_resolution"] is True
