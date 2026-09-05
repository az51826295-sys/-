"""후처리 스냅 — 고칠 것만 고치고, 통과율의 뜻을 바꾸지 않게 막는다."""
import pytest

from genesis import snap_fix
from genesis import svg_raster
from tools import icon_judge
from tools import snap_experiment as se

DOC = icon_judge.load_spec()

OFF_GRID = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
            'stroke="#333" stroke-width="2" fill="#eee">'
            '<path d="M4.37 4.11 L19.8 20.2" stroke-linecap="butt"/></svg>')


def test_snap_fixes_notation_and_the_judge_agrees():
    got = snap_fix.snap(OFF_GRID)
    assert got["svg"], got["why"]
    before = icon_judge.judge_svg(OFF_GRID, DOC)
    after = icon_judge.judge_svg(got["svg"], DOC)
    broke = {r["rule"] for r in before["rules"] if r["ok"] is False}
    still = {r["rule"] for r in after["rules"] if r["ok"] is False}
    assert {"grid.snap", "palette", "stroke.width"} & broke
    assert not ({"grid.snap", "palette", "stroke.width",
                 "stroke.linecap", "fill"} & still)


def test_snap_refuses_a_different_canvas():
    other = OFF_GRID.replace('viewBox="0 0 24 24"', 'viewBox="0 0 32 32"')
    got = snap_fix.snap(other)
    assert got["svg"] is None and "viewBox" in got["why"]


def test_snap_does_not_fix_structure():
    """여백·개수·바이트·금지 요소는 표기가 아니라 구조다 — 고치지 않는다."""
    too_close = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
                 'fill="none" stroke="currentColor" stroke-width="1.5" '
                 'stroke-linecap="round" stroke-linejoin="round">'
                 '<path d="M0.5 0.5 L23.5 23.5"/><script/></svg>')
    got = snap_fix.snap(too_close)
    assert got["svg"]
    res = icon_judge.judge_svg(got["svg"], DOC)
    broken = {r["rule"] for r in res["rules"] if r["ok"] is False}
    assert "padding.min" in broken and "forbidden_elements" in broken


def test_arc_flags_survive_snapping():
    """반지름·플래그를 반올림하면 그림이 뒤집힌다 — 끝점만 격자에 올린다."""
    arc = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
           'fill="none" stroke="currentColor" stroke-width="1.5" '
           'stroke-linecap="round" stroke-linejoin="round">'
           '<path d="M6.2 12 A 6 6 0 0 1 17.9 12"/></svg>')
    got = snap_fix.snap(arc)["svg"]
    assert "0 0 1" in got.replace("  ", " ")
    assert "A 6 6" in got.replace("  ", " ")


@pytest.mark.skipif(not svg_raster.available(), reason="래스터 없음")
def test_snapping_a_compliant_icon_changes_nothing_visible():
    svg = open("out/icons/pick-v2/candidates/01_attack/c01.svg",
               encoding="utf-8").read()
    got = snap_fix.snap(svg)["svg"]
    assert svg_raster.coverage_diff(svg, got) <= 0.02


def test_a_corpus_of_passing_assets_cannot_prove_the_snap_works():
    """이빨: 통과분만 있는 표본에서 '스냅 후 100%'는 증거가 아니다."""
    calls = [{"concept": f"c{i}",
              "candidates": [{"concept": f"c{i}", "svg": "x",
                              "raw_verdict": "PASS", "snapped": "x",
                              "snapped_verdict": "PASS"} for _ in range(6)]}
             for i in range(9)]
    v = se.verdict_pass(calls, saved_corpus=True)
    assert v["verdict"] == "undefined" and v["why"] == "corpus_is_all_passing"
    # saved 표식 없이도 원본이 전부 통과면 판정하지 않는다
    assert se.verdict_pass(calls)["why"] == "corpus_is_all_passing"
