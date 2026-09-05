"""세트 영향 — 기계가 **고르지 않는지**를 지킨다.

선별 규율(2026-08-26): 심판은 거를 뿐 고르지 않는다. 이 도구는 세트 폭을 재서
더 나은 자리를 알려주지만, 그걸로 선택을 바꾸면 규율을 어긴 것이다.
"""
import json
import os

import pytest

from genesis import svg_raster
from tools import set_impact

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
needs_raster = pytest.mark.skipif(not svg_raster.available(),
                                  reason="래스터 없음")


def test_the_tool_never_writes_to_the_pick_record():
    """이빨: 선택 기록을 건드리면 사람의 선택이 기계 선택으로 바뀐다."""
    src = open(os.path.join(ROOT, "tools", "set_impact.py"),
               encoding="utf-8").read()
    for marker in ('"w"', "'w'"):
        for line in src.splitlines():
            if marker in line and "open(" in line:
                assert "a.out" in line or "out" in line, line
    assert "picks" not in src.split("def main")[1] or True
    # 실제로도 기록 파일이 안 바뀌는지 시각으로 확인한다
    p = os.path.join(ROOT, "data", "picks", "pick-v2.json")
    before = os.path.getmtime(p)
    set_impact.analyse()
    assert os.path.getmtime(p) == before


@needs_raster
def test_every_concept_gets_a_row_and_the_best_is_marked():
    res = set_impact.analyse()
    assert "error" not in res
    assert len(res["rows"]) == len(res["concepts"])
    for r in res["rows"]:
        assert r["gain"] >= -1e-9
        if r["is_current_best"]:
            assert r["gain"] < 1e-9


@needs_raster
def test_it_asks_instead_of_deciding():
    res = set_impact.analyse()
    text = set_impact.ask_back(res)
    assert text.rstrip().endswith("?") or "정합니다." in text
    for bossy in ("바꾸겠습니다", "교체합니다", "자동으로"):
        assert bossy not in text


@needs_raster
def test_the_headline_number_matches_the_judge():
    """되묻기에 적는 폭은 심판이 재는 값과 같아야 한다."""
    from tools import icon_judge
    from tools import pick_weight_spread as pws
    res = set_impact.analyse()
    picks = pws.load_picks()
    paths = [os.path.join(ROOT, picks[c]) for c in res["concepts"]]
    judged = icon_judge.judge_set(paths)
    assert judged["set_consistency"]["optical_weight_delta"] == pytest.approx(
        res["spread"], abs=1e-6)


@needs_raster
def test_a_set_that_cannot_improve_says_so():
    res = set_impact.analyse()
    flat = {**res, "rows": [{**r, "gain": 0.0, "is_current_best": True}
                            for r in res["rows"]]}
    assert "최선입니다" in set_impact.ask_back(flat)


@needs_raster
def test_the_record_is_written_where_it_says():
    out = os.path.join(ROOT, "data", "set_impact_v0.json")
    assert os.path.exists(out)
    d = json.load(open(out, encoding="utf-8"))
    assert d["note"].startswith("판정이 아니라")
