"""타일·캐릭터 계측기 — 한 장으로는 안 보이는 결함을 실제로 잡는지.

이 계측기가 무의미해지는 길은 둘이다: 이음새가 터진 타일을 통과시키거나,
못 재는 것(단색 타일·방향 누락)을 0이나 통과로 접거나.
"""
import os

import pytest

from genesis import tile_probe as tp

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _png(path, pixels, size):
    from PIL import Image
    im = Image.new("RGBA", size)
    im.putdata(pixels)
    im.save(path)
    return str(path)


def _gradient_tile(tmp_path, seamless: bool):
    """가로로 밝아지는 타일. seamless면 좌우가 이어지도록 되돌아온다."""
    w = h = 16
    px = []
    for _y in range(h):
        for x in range(w):
            if seamless:
                # 0..7..0 로 돌아오므로 오른쪽 끝과 왼쪽 끝이 붙는다
                v = int(255 * (1 - abs(x - w / 2) / (w / 2)))
            else:
                v = int(255 * x / (w - 1))     # 끝에서 뚝 끊긴다
            px.append((v, v, v, 255))
    name = "seamless.png" if seamless else "seamy.png"
    return _png(tmp_path / name, px, (w, h))


def test_a_tile_with_a_visible_seam_scores_much_higher(tmp_path):
    good = tp.tile_seam(_gradient_tile(tmp_path, True))
    bad = tp.tile_seam(_gradient_tile(tmp_path, False))
    assert good["seam_ratio_x"] is not None and bad["seam_ratio_x"] is not None
    assert bad["seam_ratio_x"] > good["seam_ratio_x"] * 3, (
        f'이음새가 터진 타일을 못 가른다: {good["seam_ratio_x"]} vs '
        f'{bad["seam_ratio_x"]}')


def test_a_flat_tile_is_undefined_not_zero(tmp_path):
    """이빨: 단색 타일은 내부 변화가 0이라 비율이 없다. 0으로 접으면 거짓말이다."""
    px = [(20, 120, 60, 255)] * (16 * 16)
    got = tp.tile_seam(_png(tmp_path / "flat.png", px, (16, 16)))
    assert got["seam_ratio_x"] is None and got["seam_ratio_y"] is None
    assert got["interior_dx"] == 0
    assert "단색" in got["error"], f'왜 못 쟀는지가 틀리게 적혔다: {got["error"]}'


def test_a_broken_file_reports_an_error_not_a_number(tmp_path):
    bad = tmp_path / "broken.png"
    bad.write_bytes(b"not a png")
    got = tp.tile_seam(str(bad))
    assert got["error"] and got["seam_ratio_x"] is None


def test_real_pixellab_tiles_are_measured():
    """실측: 오디션 타일 16장이 전부 값을 낸다(판정은 문턱 동결 뒤)."""
    import glob
    files = sorted(glob.glob(os.path.join(ROOT, "audition", "pixellab",
                                          "tileset_*.png")))
    assert len(files) >= 8
    ratios = [tp.tile_seam(f)["seam_ratio_x"] for f in files]
    assert all(r is not None for r in ratios)


def test_character_set_catches_a_missing_frame(tmp_path):
    base = tmp_path / "hero"
    px = [(0, 0, 0, 0)] * 64
    for d in tp.DIRS:
        os.makedirs(base / "rotations", exist_ok=True)
        body = list(px)
        for i in range(8, 40):
            body[i] = (10, 20, 30, 255)
        _png(base / "rotations" / f"{d}.png", body, (8, 8))
        wdir = base / "walking" / d
        os.makedirs(wdir, exist_ok=True)
        n = 6 if d != "north" else 5          # 한 방향만 하나 적다
        for i in range(n):
            _png(wdir / f"frame_{i:03d}.png", body, (8, 8))
    got = tp.character_set(str(base))
    assert got["frame_count_equal"] is False
    assert got["frame_counts"]["north"] == 5


def test_character_set_reports_undefined_when_a_direction_is_missing(tmp_path):
    base = tmp_path / "half"
    os.makedirs(base / "rotations", exist_ok=True)
    px = [(1, 2, 3, 255)] * 64
    _png(base / "rotations" / "south.png", px, (8, 8))
    got = tp.character_set(str(base))
    assert got["frame_count_equal"] is None      # fail이 아니다
    assert got["bbox_height_spread"] is None
    assert any("north" in m for m in got["missing"])


@pytest.mark.parametrize("name", ["hero", "merchant"])
def test_real_characters_are_measured(name):
    base = os.path.join(ROOT, "game", "assets", "characters", name)
    if not os.path.isdir(base):
        pytest.skip("자산 없음")
    got = tp.character_set(base)
    assert got["frame_count_equal"] is True      # 둘 다 6프레임씩
    assert got["bbox_height_spread"] is not None
    assert got["palette_overlap_min"] is not None
