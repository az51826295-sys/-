"""팔레트 추출 시험 — 세는 것이 맞나, 그리고 **동결로 새지 않나**."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools import palette_extract as pe                  # noqa: E402

Image = pytest.importorskip("PIL.Image")

T = (0, 0, 0, 0)
R = (255, 0, 0, 255)
G = (0, 255, 0, 255)
B = (0, 0, 255, 255)


def _png(tmp_path, pixels, name="a.png", scale=1):
    h, w = len(pixels), len(pixels[0])
    img = Image.new("RGBA", (w, h))
    img.putdata([p for row in pixels for p in row])
    if scale > 1:
        img = img.resize((w * scale, h * scale), Image.NEAREST)
    path = str(tmp_path / name)
    img.save(path)
    return path


def test_counts_only_opaque_and_sorts_by_pixels(tmp_path):
    px = [[R, R, R],
          [G, G, T],
          [B, T, T]]
    r = pe.extract([_png(tmp_path, px)])
    assert r["opaque_pixels_total"] == 6          # 투명 3칸은 안 센다
    assert [c["hex"] for c in r["palette"]] == ["#ff0000", "#00ff00",
                                                "#0000ff"]
    assert r["palette"][0]["count"] == 3
    assert r["palette"][0]["share"] == 0.5


def test_upscaled_file_gives_same_shares(tmp_path):
    """정수배 확대본이 원본과 같은 비중을 내야 한다(정규화)."""
    px = [[R, G], [B, T]]
    base = pe.extract([_png(tmp_path, px, "base.png")])
    big = pe.extract([_png(tmp_path, px, "big.png", scale=8)])
    assert base["opaque_pixels_total"] == big["opaque_pixels_total"] == 3
    assert ([c["share"] for c in base["palette"]]
            == [c["share"] for c in big["palette"]])
    assert big["sources"][0]["block_size"] == 8


def test_over_top_is_reported_not_dropped(tmp_path):
    px = [[R, G, B]]
    r = pe.extract([_png(tmp_path, px)], top=2)
    assert len(r["palette"]) == 2
    assert r["over_top"]["colors"] == 1
    assert r["over_top"]["pixel_share"] == round(1 / 3, 6)


def test_result_is_never_frozen(tmp_path):
    r = pe.extract([_png(tmp_path, [[R]])])
    assert r["frozen"] is False and r["frozen_by"] is None
    assert r["status"] == "proposed"


def test_unreadable_file_is_recorded_not_raised(tmp_path):
    bad = str(tmp_path / "none.png")
    r = pe.extract([bad])
    assert r["errors"] and r["errors"][0]["path"] == bad
    assert r["palette"] == []


def test_merges_multiple_sources(tmp_path):
    a = _png(tmp_path, [[R, R]], "a.png")
    b = _png(tmp_path, [[G]], "b.png")
    r = pe.extract([a, b])
    assert r["opaque_pixels_total"] == 3
    assert len(r["sources"]) == 2
