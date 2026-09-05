"""래스터 규칙 시험 — 정의대로 재는가, 그리고 **반례를 거절하는가**.

설계: docs/icon-raster-rules-design.md. 이빨 규율(judge-bench-v1.2 규율 1)에
따라, 통과 사례만이 아니라 **한 곳만 어긋낸 변이**가 실제로 문턱을 넘는지를
같이 시험한다.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from genesis import svg_raster as sr                     # noqa: E402

pytest.importorskip("svglib.svglib")
pytest.importorskip("reportlab.graphics")

HEAD = ('<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="{w}" '
        'stroke-linecap="round" stroke-linejoin="round" fill="none">')
X = HEAD.format(w="1.5") + '<path d="M6 6L18 18M18 6L6 18"/></svg>'
X_THICK = HEAD.format(w="4") + '<path d="M6 6L18 18M18 6L6 18"/></svg>'
DOT = HEAD.format(w="1.5") + '<path d="M12 12L12.5 12"/></svg>'

# 문턱은 hidden 스펙에서 온다(동결). 여기서 정하지 않는다.
MAX_ROUNDTRIP = 0.02
MAX_WEIGHT_DELTA = 0.15


def test_reemit_preserves_path_geometry():
    out = sr.reemit_path("M6 6L18 18M18 6L6 18")
    assert out == "M 6 6 L 18 18 M 18 6 L 6 18"


def test_reemit_drops_what_the_parser_dropped():
    """파서가 중간에 멈추면 재출력본에서도 사라진다 - 그게 신호다."""
    broken = "M6 6L18 18L20"          # 마지막 L의 인자가 모자라다
    assert sr.reemit_path(broken) == "M 6 6 L 18 18"


def test_roundtrip_is_zero_for_a_clean_icon():
    d = sr.roundtrip_diff(X)
    assert d is not None
    assert d <= MAX_ROUNDTRIP


def test_diff_has_teeth_when_one_coordinate_moves():
    """이빨(설계 §2 반례): 좌표 하나만 옮겨도 문턱을 넘어야 지표가 산 것이다."""
    moved = HEAD.format(w="1.5") + '<path d="M6 6L18 18M18 6L6 12"/></svg>'
    d = sr.coverage_diff(X, moved)
    assert d is not None
    assert d > MAX_ROUNDTRIP


def test_malformed_path_is_undefined_on_both_sides():
    """파서가 못 읽는 d는 렌더러도 거절한다 → 값이 아니라 미측정.

    파서만 조용히 잘라내고 통과시키는 일이 없다는 확인이기도 하다.
    """
    bad = HEAD.format(w="1.5") + '<path d="M6 6L18 18L20"/></svg>'
    assert sr.reemit_path("M6 6L18 18L20") == "M 6 6 L 18 18"   # 잘려 나간다
    assert sr.render_coverage(bad) is None                      # 렌더러도 거절
    assert sr.roundtrip_diff(bad) is None


def test_optical_weight_grows_with_stroke_width():
    thin, thick = sr.optical_weight(X), sr.optical_weight(X_THICK)
    assert thin is not None and thick is not None
    assert 0 < thin < thick < 1


def test_optical_weight_is_color_independent():
    """색은 기하 측정용 도구다 - 값이 색에 흔들리면 정의가 틀린 것이다."""
    red = X.replace("currentColor", "#ff0000")
    assert sr.optical_weight(X) == pytest.approx(sr.optical_weight(red),
                                                 abs=0.02)


def test_weight_delta_needs_two_and_has_teeth():
    assert sr.optical_weight_delta([X]) is None          # 1건은 미정의
    same = sr.optical_weight_delta([X, X])
    assert same == 0.0
    mixed = sr.optical_weight_delta([X, X_THICK])
    assert mixed is not None and mixed > MAX_WEIGHT_DELTA


def test_unrenderable_input_is_undefined_not_zero():
    assert sr.render_coverage("<svg><not xml") is None
    assert sr.optical_weight("<svg><not xml") is None
    assert sr.roundtrip_diff("<svg><not xml") is None
    # viewBox가 없으면 크기를 못 맞춘다 → 미측정
    assert sr.render_coverage('<svg><path d="M0 0L1 1"/></svg>') is None


def test_tiny_mark_is_measured_not_dropped():
    """거의 안 보이는 획도 값이 나와야 한다(0이 아니라 작은 값)."""
    w = sr.optical_weight(DOT)
    assert w is not None and 0 < w < 0.05


def test_contrast_is_deliberately_absent():
    """설계 §1: 색 문맥이 없어 대비는 정의할 수 없다. 지어내지 않는다."""
    assert not hasattr(sr, "contrast")
    assert not hasattr(sr, "contrast_ratio")
