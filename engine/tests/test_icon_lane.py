"""아이콘 레인 Validator J — 설계: docs/icon-lane-design.md

핵심 주장: 생성은 외부 LLM이 하고 **심판은 우리 계산**이다. 후보가 "격자
맞췄어요"라고 말하는 걸 읽지 않고, 좌표를 우리가 센다. 모델 호출 0.
"""

import os

import pytest

from genesis import icon_lane as il
from genesis import svg_raster
from tools import icon_judge as ij
from tools import judge_bench as jb

OK = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
      'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" '
      'stroke-linejoin="round"><path d="M 4 12.5 L 9.5 18 L 20 6.5"/></svg>')

DOC = ij.load_spec()


def sub(svg, a, b):
    assert a in svg
    return svg.replace(a, b)


# ---------------------------------------------------------------- 측정

def test_measures_a_clean_icon():
    m = il.measure(OK)
    assert m["error"] is None
    assert m["viewbox"] == "0 0 24 24"
    assert m["off_grid"] == []
    assert m["stroke_widths"] == [1.5]
    assert m["colors"] == []             # currentColor는 하드코딩 색이 아니다
    assert m["path_count"] == 1 and m["command_count"] == 3
    assert m["min_padding"] == 4.0       # 가장 가까운 좌표가 4
    assert set(m["elements"]) == {"svg", "path"}


def test_catches_off_grid_coordinates():
    m = il.measure(sub(OK, "M 4 12.5", "M 4.37 12.13"))
    assert m["off_grid"] == [4.37, 12.13]


def test_catches_hardcoded_color():
    m = il.measure(sub(OK, 'stroke="currentColor"', 'stroke="#3b82f6"'))
    assert m["colors"] == ["#3b82f6"]


def test_padding_uses_control_points_conservatively():
    # 곡선 제어점이 가장자리에 붙으면 여백은 작게 잡힌다(통과를 부풀리지 않음)
    m = il.measure(sub(OK, 'd="M 4 12.5 L 9.5 18 L 20 6.5"',
                       'd="M 4 12 C 0.5 2 20 2 20 12"'))
    assert m["min_padding"] == 0.5


def test_arc_radii_are_not_treated_as_coordinates():
    # A 명령의 rx/ry/플래그는 좌표가 아니다 - 격자 위반으로 오인하면 안 된다
    m = il.measure(sub(OK, 'd="M 4 12.5 L 9.5 18 L 20 6.5"',
                       'd="M 6 12 A 3.7 3.7 0 1 0 18 12"'))
    assert m["off_grid"] == []
    assert m["command_count"] == 2


def test_relative_commands_tracked_for_bbox():
    m = il.measure(sub(OK, 'd="M 4 12.5 L 9.5 18 L 20 6.5"',
                       'd="M 4 4 l 16 0 l 0 16"'))
    assert m["off_grid"] == []
    assert m["min_padding"] == 4.0       # 절대 좌표로 (20,20)까지 간다


def test_forbidden_element_is_visible_to_the_judge():
    m = il.measure(sub(OK, "<path", "<script/><path"))
    assert "script" in m["elements"]


def test_broken_svg_is_reported_not_swallowed():
    m = il.measure("<svg><path d=")
    assert m["error"] and "파싱 실패" in m["error"]


# ---------------------------------------------------------------- 구조 서명

def test_structure_hash_ignores_formatting():
    spaced = OK.replace("><", ">\n  <").replace('d="M 4', 'd="M  4')
    assert il.structure_hash(spaced) == il.structure_hash(OK)


def test_structure_hash_separates_different_shapes():
    other = sub(OK, 'd="M 4 12.5 L 9.5 18 L 20 6.5"', 'd="M 12 4 L 12 20"')
    assert il.structure_hash(other) != il.structure_hash(OK)


def test_duplicates_found_in_a_set():
    other = sub(OK, 'd="M 4 12.5 L 9.5 18 L 20 6.5"', 'd="M 12 4 L 12 20"')
    assert il.duplicates([OK, other, OK]) == [(0, 2)]


def test_set_consistency_flags_mixed_stroke_widths():
    thick = sub(OK, 'stroke-width="1.5"', 'stroke-width="2"')
    assert il.set_consistency([OK, OK])["variance_zero"] is True
    assert il.set_consistency([OK, thick])["variance_zero"] is False


# ---------------------------------------------------------------- 심판

def test_clean_icon_passes():
    res = ij.judge_svg(OK, DOC)
    assert res["verdict"] == "PASS"
    assert all(r["ok"] for r in res["rules"])


@pytest.mark.parametrize("old,new,rule", [
    ('d="M 4 12.5 L 9.5 18 L 20 6.5"', 'd="M 4.37 12.13 L 9.5 18"', "grid.snap"),
    ('stroke-width="1.5"', 'stroke-width="2"', "stroke.width"),
    ('stroke="currentColor"', 'stroke="#3b82f6"', "palette"),
    ('viewBox="0 0 24 24"', 'viewBox="0 0 32 32"', "viewBox"),
    ('d="M 4 12.5 L 9.5 18 L 20 6.5"', 'd="M 0.5 0.5 L 9.5 18"', "padding.min"),
    ("<path", "<text/><path", "forbidden_elements"),
])
def test_each_violation_is_caught(old, new, rule):
    res = ij.judge_svg(sub(OK, old, new), DOC)
    assert res["verdict"] == "FAIL"
    assert rule in {r["rule"] for r in res["rules"] if not r["ok"]}


def test_report_matches_the_registered_format():
    res = ij.judge_svg(sub(OK, 'stroke-width="1.5"', 'stroke-width="2"'), DOC)
    text = ij.report(res, candidate=3)
    assert text.startswith("VERDICT: FAIL")
    assert "candidate: 3" in text
    assert "violations:" in text and "  - rule: stroke.width" in text
    assert "passed:" in text and "  - grid.snap" in text


def test_hidden_rule_never_leaks_its_name():
    # 신규성(중복)은 hidden - 사유를 알려주면 회피가 아니라 모방을 유도한다
    res = ij.judge_svg(OK, DOC, peers=[OK])
    assert res["verdict"] == "FAIL"
    text = ij.report(res)
    assert "internal_quality_gate" in text
    assert "novelty" not in text and "structure_hash" not in text


def test_public_prompt_spec_carries_no_hidden_values():
    text = ij.public_prompt_spec(DOC)
    for leak in ("contrast", "roundtrip", "structure_hash", "4.5",
                 "optical_weight", "novelty"):
        assert leak not in text, leak
    assert "0 0 24 24" in text and "max_bytes" in text


# ---------------------------------------------------------------- 레지스트리 결합

def test_icon_atom_has_teeth_and_is_measured():
    a = ij.atom()
    r = jb.bench_atom(a)
    assert r["verdict"] == "teeth" and r["teeth"] >= 10
    assert r["evidence"] == "measured"      # 후보의 자기신고가 아니다


def test_icon_atom_is_bound_to_a_real_adapter():
    from tools import artifact_adapter as aa
    st = aa.binding_status(ij.atom())
    assert st["status"] == "bound" and st["adapter"] == "svg_file"


def test_end_to_end_on_a_real_file(tmp_path):
    from tools import artifact_adapter as aa
    p = tmp_path / "icon.svg"
    p.write_text(OK, encoding="utf-8")
    res = aa.judge_artifacts(ij.atom(), {
        "adapter": "svg_file", "params": {"path": str(p)},
        "spec": ij.spec_for_judge(DOC)})
    assert res["verdict"] == "passed"
    assert res["evidence"] == "measured"


def test_cli_set_dir_reports_duplicates(tmp_path, capsys):
    (tmp_path / "a.svg").write_text(OK, encoding="utf-8")
    (tmp_path / "b.svg").write_text(OK.replace("><", ">\n<"), encoding="utf-8")
    code = ij.main(["--set-dir", str(tmp_path)])
    out = capsys.readouterr().out
    assert code == 1                       # 중복이 있으니 세트는 미통과
    assert "중복쌍 [(0, 1)]" in out
    # 08-26: 왕복오차·광학 무게는 잰다. contrast는 화면 층으로 이관됐다.
    assert "미측정(도구 없음): 없음" in out
    assert "화면 층으로 이관(자산 심판 아님): contrast" in out
    assert "roundtrip" not in out


def test_contrast_moved_to_the_screen_layer(tmp_path):
    """contrast는 자산이 아니라 화면이 답할 규칙이다(사장님 결정 b, 08-26).

    색 문맥이 파일에 없으므로 여기서 재면 자산과 무관한 상수가 된다.
    "못 쟀다"(도구 부재)와 "여기서 잴 것이 아니다"(층이 다름)를 섞지 않는다.
    """
    assert "contrast" not in DOC["hidden"]          # 자산 심판에서 빠졌고
    assert "contrast" in DOC["screen_layer"]        # 화면 층에 있다
    assert DOC["screen_layer"]["contrast"]["owner"] == "ui-theme"
    assert DOC["screen_layer"]["contrast"]["status"] == "deferred"
    names = {r["rule"] for r in ij.judge_svg(OK, DOC)["rules"]}
    assert not any(n.startswith("contrast") for n in names)
    (tmp_path / "a.svg").write_text(OK, encoding="utf-8")
    res = ij.judge_set([str(tmp_path / "a.svg")], DOC)
    assert "contrast" not in res["unmeasured"]      # 미측정이 아니라
    assert res["screen_layer"] == ["contrast"]      # 이관이다


def test_missing_rasterizer_reports_unmeasured_not_fail(tmp_path, monkeypatch):
    """도구가 없는 기계에서는 규칙을 걸지 않고 미측정으로 밝힌다.

    도구 부재로 후보를 미정의로 떨어뜨리면 기계를 옮겼을 뿐인데 판정이 바뀐다.
    """
    monkeypatch.setattr(svg_raster, "available", lambda: False)
    names = {r["rule"] for r in ij.judge_svg(OK, DOC)["rules"]}
    assert "roundtrip.max_pixel_diff" not in names
    assert ij.judge_svg(OK, DOC)["verdict"] == "PASS"
    (tmp_path / "a.svg").write_text(OK, encoding="utf-8")
    res = ij.judge_set([str(tmp_path / "a.svg")], DOC)
    assert "roundtrip" in res["unmeasured"]


def test_roundtrip_is_now_measured_when_the_rasterizer_exists(tmp_path):
    """08-26 B1: 왕복오차는 규칙이 됐다 - 통과분에서 실제로 판정된다."""
    if not svg_raster.available():
        pytest.skip("래스터 경로 미설치")
    rows = {r["rule"]: r for r in ij.judge_svg(OK, DOC)["rules"]}
    assert "roundtrip.max_pixel_diff" in rows
    assert rows["roundtrip.max_pixel_diff"]["ok"] is True
    assert rows["roundtrip.max_pixel_diff"]["hidden"] is True
    assert "roundtrip" not in ij.judge_set([], DOC)["unmeasured"]


def test_set_optical_weight_delta_has_teeth(tmp_path):
    """이빨: 같은 획 굵기라도 잉크 밀도가 크게 다르면 폭이 문턱을 넘어야 한다.

    굵기가 아니라 **밀도**로 시험하는 이유: 공개 스펙이 이미 획 굵기를 1.5로
    못박고 있으므로, 굵기 차이는 이 규칙에 오기 전에 걸린다. 세트 일관성이
    실제로 지키는 축은 남는 축, 즉 밀도다.
    """
    if not svg_raster.available():
        pytest.skip("래스터 경로 미설치")
    head = OK[:OK.index(">") + 1]
    sparse = head + '<path d="M11.5 12L12.5 12"/></svg>'
    dense = head + "".join(f'<path d="M2 {y}L22 {y}"/>'
                           for y in (3, 6.5, 10, 13.5, 17, 20.5)) + "</svg>"
    (tmp_path / "a.svg").write_text(sparse, encoding="utf-8")
    (tmp_path / "b.svg").write_text(dense, encoding="utf-8")
    c = ij.judge_set([str(tmp_path / "a.svg"), str(tmp_path / "b.svg")],
                     DOC)["set_consistency"]
    assert c["optical_weight_delta"] > DOC["hidden"]["set_consistency"][
        "optical_weight_delta_max"]
    assert c["optical_weight_delta_ok"] is False


def test_matching_set_passes_the_weight_rule(tmp_path):
    """같은 아이콘 둘이면 폭 0 - 규칙이 아무거나 떨어뜨리지는 않는다."""
    if not svg_raster.available():
        pytest.skip("래스터 경로 미설치")
    (tmp_path / "a.svg").write_text(OK, encoding="utf-8")
    (tmp_path / "b.svg").write_text(OK, encoding="utf-8")
    c = ij.judge_set([str(tmp_path / "a.svg"), str(tmp_path / "b.svg")],
                     DOC)["set_consistency"]
    assert c["optical_weight_delta"] == 0.0
    assert c["optical_weight_delta_ok"] is True
