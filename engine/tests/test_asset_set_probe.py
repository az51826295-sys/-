"""세트 계측기 — 낱장이 다 통과해도 세트로 보면 걸리는 것.

이 계측기가 무의미해지는 길: 못 잰 것을 0이나 통과로 접는 것.
"""
import glob
import os

import pytest

from genesis import asset_set_probe as sp

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILES = sorted(glob.glob(os.path.join(ROOT, "audition", "pixellab",
                                      "tileset_*.png")))
CHARS = [os.path.join(ROOT, "game", "assets", "characters", n)
         for n in ("hero", "merchant")]


@pytest.mark.skipif(len(TILES) < 8, reason="타일 자산 없음")
def test_the_tile_set_is_measured_as_a_set():
    r = sp.tile_set(TILES)
    assert r["count"] == len(TILES)
    assert r["sizes_uniform"] is True and r["logical_sizes"] == ["16x16"]
    # 낱장 상한은 24색인데 세트 전체는 그보다 크다 - 세트로 봐야 보이는 사실
    assert r["palette_union"] > 24
    assert r["seam_ratio_max"] >= r["seam_ratio_median"]
    assert r["worst_tile"]


def test_a_set_with_mixed_sizes_is_caught(tmp_path):
    from PIL import Image
    paths = []
    for i, size in enumerate((16, 16, 8)):
        im = Image.new("RGBA", (size, size))
        im.putdata([((x * 7 + y * 3) % 256, 40, 90, 255)
                    for y in range(size) for x in range(size)])
        p = tmp_path / f"t{i}.png"
        im.save(p)
        paths.append(str(p))
    r = sp.tile_set(paths)
    assert r["sizes_uniform"] is False
    assert len(r["logical_sizes"]) > 1


def test_an_unmeasurable_tile_is_listed_not_silently_dropped(tmp_path):
    from PIL import Image
    flat = tmp_path / "flat.png"
    Image.new("RGBA", (16, 16), (10, 20, 30, 255)).save(flat)
    r = sp.tile_set([str(flat)])
    assert r["seam_ratio_max"] is None          # 0이 아니다
    assert r["unmeasured"] and "flat.png" in r["unmeasured"][0]["path"]


@pytest.mark.skipif(not all(os.path.isdir(c) for c in CHARS),
                    reason="캐릭터 자산 없음")
def test_characters_are_compared_to_each_other():
    g = sp.character_group(CHARS)
    assert g["count"] == 2
    assert set(g["heights"]) == {"hero", "merchant"}
    assert g["height_spread"] is not None
    assert g["frame_counts_uniform"] is True
    assert g["palette_union"] > 0


def test_an_empty_group_is_an_error_not_a_pass():
    assert sp.tile_set([])["error"]
    assert sp.character_group([])["error"]
