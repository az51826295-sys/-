"""인-스펙 변이 v0.1 — 원호(A)에 미러·회전을 걸어도 기하가 보존되는가.

수용 검사는 우리 파서가 아니라 **렌더러**가 한다(설계 §7): 변환본을 그린 그림과,
원본을 그려서 같은 변환을 픽셀로 준 그림이 같아야 한다. 문턱 0.02는 스펙의
`hidden.roundtrip.max_pixel_diff`와 같은 숫자다 — 새로 만든 값이 아니다.
"""
import pytest

from genesis import inspec_variants as iv
from genesis import svg_raster

MAX_PIXEL_DIFF = 0.02

ARC = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
       'fill="none" stroke="currentColor" stroke-width="1.5" '
       'stroke-linecap="round" stroke-linejoin="round">'
       '<path d="M6 12 A 6 6 0 0 1 18 12"/></svg>')

needs_raster = pytest.mark.skipif(not svg_raster.available(),
                                  reason="래스터 경로가 없다 — fail이 아니라 미측정")


def _mean_diff(a: list, b: list) -> float:
    px = len(a)
    return sum(abs(a[y][x] - b[y][x])
               for y in range(px) for x in range(px)) / (px * px)


def _pixel_mirror(cov: list) -> list:
    return [list(reversed(row)) for row in cov]


def _pixel_rot90(cov: list) -> list:
    """기하 (x,y) → (y, 24−x)에 대응하는 픽셀 변환."""
    px = len(cov)
    return [[cov[c][px - 1 - r] for c in range(px)] for r in range(px)]


def test_mirror_no_longer_refuses_arcs():
    got = iv.mirror(ARC)
    assert got["svg"], got.get("why")
    assert iv.rotate90(ARC)["svg"]


@needs_raster
def test_mirrored_arc_draws_the_mirrored_picture():
    got = iv.mirror(ARC)["svg"]
    base = svg_raster.render_coverage(ARC)
    made = svg_raster.render_coverage(got)
    assert base is not None and made is not None
    assert _mean_diff(made, _pixel_mirror(base)) <= MAX_PIXEL_DIFF


@needs_raster
def test_rotated_arc_draws_the_rotated_picture():
    got = iv.rotate90(ARC)["svg"]
    base = svg_raster.render_coverage(ARC)
    made = svg_raster.render_coverage(got)
    assert base is not None and made is not None
    assert _mean_diff(made, _pixel_rot90(base)) <= MAX_PIXEL_DIFF


@needs_raster
def test_a_mirror_that_forgets_the_sweep_flag_is_caught():
    """이빨: 플래그를 안 뒤집은 가짜 미러는 이 검사를 통과하면 안 된다."""
    bad = iv._map_svg(ARC, lambda x, y: (iv.VIEWBOX - x, y), arc=None)
    base = svg_raster.render_coverage(ARC)
    made = svg_raster.render_coverage(bad)
    assert base is not None and made is not None
    assert _mean_diff(made, _pixel_mirror(base)) > MAX_PIXEL_DIFF


def test_arc_rule_table_matches_the_registered_design():
    rx, ry, phi, laf, sf = 6, 6, 30, 0, 1
    assert iv.ARC_RULES["mirror"](rx, ry, phi, laf, sf) == (6, 6, 150, 0, 0)
    assert iv.ARC_RULES["rot90"](rx, ry, phi, laf, sf) == (6, 6, 120, 0, 1)
    assert iv.ARC_RULES[None](rx, ry, phi, laf, sf) == (6, 6, 30, 0, 1)


def test_translation_leaves_arc_parameters_alone():
    moved = [v for v in iv.translations(ARC) if v["svg"]]
    assert moved, "원호 자산이 평행이동조차 안 된다"
    for v in moved:
        assert " 6 6 0 0 1 " in v["svg"].replace("A ", " ").replace("  ", " ")


SHAPES = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
          'fill="none" stroke="currentColor" stroke-width="1.5" '
          'stroke-linecap="round" stroke-linejoin="round">'
          '<circle cx="12" cy="8" r="3"/>'
          '<rect x="6" y="13" width="6" height="6"/>'
          '<line x1="14" y1="14" x2="18" y2="18"/>'
          '<polyline points="4,4 8,4 8,8"/></svg>')


def test_to_path_converts_every_shape_and_keeps_the_picture():
    got = iv.to_path(SHAPES)
    assert got["svg"], got.get("why")
    for tag in ("<circle", "<rect", "<line", "<polyline"):
        assert tag not in got["svg"], tag
    assert got["svg"].count("<path") == 4


@needs_raster
def test_to_path_draws_the_same_picture():
    got = iv.to_path(SHAPES)["svg"]
    assert svg_raster.coverage_diff(SHAPES, got) <= MAX_PIXEL_DIFF


def test_to_path_says_why_when_there_is_nothing_to_convert():
    only_paths = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
                  'fill="none" stroke="currentColor" stroke-width="1.5" '
                  'stroke-linecap="round" stroke-linejoin="round">'
                  '<path d="M4 4 L20 20"/></svg>')
    got = iv.to_path(only_paths)
    assert got["svg"] is None and "바꿀 도형이 없다" in got["why"]


@needs_raster
def test_a_rect_converted_with_three_corners_is_caught():
    """이빨: 모서리를 하나 빠뜨린 가짜 변환은 픽셀 검사를 통과하면 안 된다."""
    rect = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
            'fill="none" stroke="currentColor" stroke-width="1.5" '
            'stroke-linecap="round" stroke-linejoin="round">'
            '<rect x="6" y="6" width="12" height="12"/></svg>')
    bad = rect.replace('<rect x="6" y="6" width="12" height="12"/>',
                       '<path d="M 6 6 L 18 6 L 18 18 Z"/>')
    assert svg_raster.coverage_diff(rect, bad) > MAX_PIXEL_DIFF


def test_to_path_is_offered_as_a_variant():
    ops = [v["op"] for v in iv.variants(SHAPES)]
    assert "요소→path" in ops
