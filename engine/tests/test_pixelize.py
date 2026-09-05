"""pixelize(격자 정리)와 반입 오라클 검증.

The asset gate has the same job as the engine's validators: only
conforming work may exist in the game folder, so the checks
themselves must be trustworthy.
"""

import pytest

PIL = pytest.importorskip("PIL")
from PIL import Image  # noqa: E402

import importlib.util
import os

_spec = importlib.util.spec_from_file_location(
    "pixelize", os.path.join(os.path.dirname(__file__), "..",
                             "tools", "artgen", "pixelize.py"))
px = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(px)


def gradient(w=256, h=512):
    img = Image.new("RGBA", (w, h))
    img.putdata([(x % 256, y % 256, (x + y) % 256, 255)
                 for y in range(h) for x in range(w)])
    return img


def test_pixelize_forces_grid_and_palette():
    out = px.pixelize(gradient(), 16, 32, colors=24)
    assert out.size == (16, 32)
    assert px.color_count(out) <= 24
    assert px.check_spec(out, 16, 32, 24, require_alpha=False) == []


def test_alpha_is_binarized():
    img = gradient(64, 64)
    img.putalpha(Image.new("L", (64, 64), 130))   # 반투명 덩어리
    out = px.pixelize(img, 16, 16, colors=8)
    alphas = {p[3] for p in out.getdata()}
    assert alphas <= {0, 255}


def test_check_rejects_wrong_size_and_too_many_colors():
    img = gradient(64, 64).resize((17, 32))
    problems = px.check_spec(img, 16, 32, 4, require_alpha=False)
    assert any("size" in p for p in problems)
    big = px.pixelize(gradient(), 32, 32, colors=32)
    assert any("colors" in p
               for p in px.check_spec(big, 32, 32, 8,
                                      require_alpha=False))


def test_check_requires_transparency_for_sprites():
    solid = px.pixelize(gradient(), 16, 16, colors=8)
    problems = px.check_spec(solid, 16, 16, 8, require_alpha=True)
    assert any("transparent" in p for p in problems)
    # 투명 픽셀을 넣으면 합격
    solid.putpixel((0, 0), (0, 0, 0, 0))
    assert px.check_spec(solid, 16, 16, 8, require_alpha=True) == []


def test_semi_transparency_is_a_violation():
    img = px.pixelize(gradient(), 16, 16, colors=8)
    img.putpixel((1, 1), (10, 10, 10, 90))
    assert any("semi" in p
               for p in px.check_spec(img, 16, 16, 9,
                                      require_alpha=False))
