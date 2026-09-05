"""취향 특징(그림) 시험 — 값이 맞나, 그리고 **확대해도 같은 값인가**.

설계: docs/taste-judge-image-v0-design.md §2. 두 번째 것이 핵심이다. 정규화가
없으면 특징이 그림이 아니라 저장 해상도를 재게 된다.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from genesis import image_taste_features as itf     # noqa: E402

Image = pytest.importorskip("PIL.Image")


def _png(tmp_path, pixels, name="a.png", scale=1):
    """pixels: 행 목록, 각 항목은 (r,g,b,a). scale배 nearest 확대."""
    h, w = len(pixels), len(pixels[0])
    img = Image.new("RGBA", (w, h))
    img.putdata([p for row in pixels for p in row])
    if scale > 1:
        img = img.resize((w * scale, h * scale), Image.NEAREST)
    path = str(tmp_path / name)
    img.save(path)
    return path


T = (0, 0, 0, 0)
K = (0, 0, 0, 255)
R = (255, 0, 0, 255)
W = (255, 255, 255, 255)


def test_frozen_feature_list():
    # 동결 목록: 늘거나 순서가 바뀌면 설계 §2 재등록 없이 바뀐 것이다.
    assert itf.FEATURES == (
        "color_count", "opaque_ratio", "bbox_fill_ratio", "mean_saturation",
        "mean_value", "value_spread", "edge_density", "symmetry_x",
        "dominant_color_share", "outline_ratio")
    assert itf.EDGE_DELTA == 30


def test_known_values(tmp_path):
    # 2×2 불투명 사각 + 투명 배경 (4×4 캔버스)
    px = [[T, T, T, T],
          [T, R, R, T],
          [T, R, R, T],
          [T, T, T, T]]
    m = itf.measure(_png(tmp_path, px))
    assert m["error"] is None
    assert m["color_count"] == 1
    assert m["opaque_ratio"] == 0.25          # 4/16
    assert m["bbox_fill_ratio"] == 0.25       # 2×2 / 16
    assert m["dominant_color_share"] == 1.0
    assert m["symmetry_x"] == 1.0
    assert m["outline_ratio"] == 1.0          # 전부 가장자리
    assert m["edge_density"] == 0.0           # 같은 색끼리만 이웃
    assert m["mean_saturation"] == 1.0
    assert m["mean_value"] == 1.0
    assert m["value_spread"] == 0.0


def test_upscale_invariance(tmp_path):
    """정수배 확대본은 원본과 **같은 값**을 내야 한다(설계 §2 정규화)."""
    px = [[T, K, K, T],
          [K, R, W, K],
          [K, W, R, K],
          [T, K, K, T]]
    base = itf.measure(_png(tmp_path, px, "base.png"))
    big = itf.measure(_png(tmp_path, px, "big.png", scale=16))
    assert base["error"] is None and big["error"] is None
    assert big["block_size"] == 16
    assert big["logical_width"] == 4 and big["logical_height"] == 4
    for f in itf.FEATURES:
        assert base[f] == big[f], f


def test_edge_density_counts_contrast(tmp_path):
    # 흑백 체커: 이웃한 불투명 쌍이 전부 대비 > 30
    px = [[K, W], [W, K]]
    m = itf.measure(_png(tmp_path, px))
    assert m["edge_density"] == 1.0
    assert m["color_count"] == 2
    assert m["value_spread"] == 1.0


def test_asymmetry_detected(tmp_path):
    px = [[R, T], [R, T]]
    m = itf.measure(_png(tmp_path, px))
    # bbox는 왼쪽 1열뿐이라 좌우 반전해도 자기 자신 → 대칭 1.0
    assert m["symmetry_x"] == 1.0
    px2 = [[R, T, T], [R, R, T], [R, T, T]]
    m2 = itf.measure(_png(tmp_path, px2, "b.png"))
    assert m2["symmetry_x"] < 1.0


def test_all_transparent_is_undefined_not_fail(tmp_path):
    """잴 수 없는 것은 fail이 아니라 undefined다(judge-bench-v1.2 규율 4)."""
    m = itf.measure(_png(tmp_path, [[T, T], [T, T]]))
    assert m["error"] is not None
    assert all(m[f] is None for f in itf.FEATURES)


def test_missing_file_reports_error(tmp_path):
    m = itf.measure(str(tmp_path / "없다.png"))
    assert m["error"] is not None
