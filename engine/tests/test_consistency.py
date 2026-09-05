"""일관성 계측의 이빨.

사장님이 정한 집중 목표("왜 도트 퀄리티가 일정하지 않을까")를 재는 자다. 자가
무디면 "일관성이 좋아졌다"는 거짓 보고가 나온다. 그래서 **알고 넣은 불일치를
이 자가 실제로 집어내는지** 먼저 확인한다.
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import consistency as cs                          # noqa: E402

GREENS = [(34, 139, 34), (46, 160, 46), (24, 110, 28), (60, 180, 60)]


def _tile(colors, path, size=16):
    im = Image.new("RGBA", (size, size))
    px = im.load()
    for y in range(size):
        for x in range(size):
            c = colors[(x + y) % len(colors)]
            px[x, y] = c + (255,)
    im.save(path)
    return str(path)


def test_같은_팔레트면_거리가_0이다(tmp_path):
    a = _tile(GREENS, tmp_path / "a.png")
    b = _tile(GREENS, tmp_path / "b.png")
    r = cs.against([b], cs.palette([a]))
    assert r["palette_distance"] == 0.0, r


def test_다른_색이면_거리가_커진다(tmp_path):
    a = _tile(GREENS, tmp_path / "a.png")
    reds = [(200, 40, 40), (170, 30, 30), (230, 60, 60), (150, 20, 20)]
    b = _tile(reds, tmp_path / "b.png")
    r = cs.against([b], cs.palette([a]))
    assert r["palette_distance"] > 0.3, r


def test_어두워지면_밝기차가_음수로_나온다(tmp_path):
    """캐릭터가 지형보다 40 어둡다는 오늘의 관찰을 이 자가 실제로 잡는가."""
    a = _tile(GREENS, tmp_path / "a.png")
    dark = [tuple(max(0, v - 60) for v in c) for c in GREENS]
    b = _tile(dark, tmp_path / "b.png")
    r = cs.against([b], cs.palette([a]))
    assert r["luma_shift"] < -30, r


def test_탁해지면_채도차가_음수로_나온다(tmp_path):
    a = _tile(GREENS, tmp_path / "a.png")
    grey = [(int(sum(c) / 3),) * 3 for c in GREENS]
    b = _tile(grey, tmp_path / "b.png")
    r = cs.against([b], cs.palette([a]))
    assert r["saturation_shift"] < -20, r


def test_단색_실루엣은_아주_멀게_나온다(tmp_path):
    """UI 아이콘이 순백 단색이라는 실제 사례. 거리 0.457이 나왔었다."""
    a = _tile(GREENS, tmp_path / "a.png")
    b = _tile([(255, 255, 255)], tmp_path / "b.png")
    r = cs.against([b], cs.palette([a]))
    assert r["palette_distance"] > 0.4, r
    assert r["luma_shift"] > 100, r


def test_투명_픽셀은_안_센다(tmp_path):
    """배경을 세면 투명 여백이 많은 자산이 저절로 '잘 맞는' 것으로 나온다."""
    a = _tile(GREENS, tmp_path / "a.png")
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    im.putpixel((8, 8), (200, 40, 40, 255))
    p = tmp_path / "b.png"
    im.save(p)
    r = cs.against([str(p)], cs.palette([a]))
    assert r["n_colors"] == 1, r
    assert r["palette_distance"] > 0.3, r


def test_기준을_내가_고르지_않는다(tmp_path):
    """spread()는 **가장 큰 무리**를 기준으로 잡는다 - 내 취향이 안 들어가게."""
    big = [_tile(GREENS, tmp_path / f"big{i}.png", size=32) for i in range(3)]
    small = [_tile([(200, 40, 40)], tmp_path / "small.png", size=4)]
    r = cs.spread({"big": big, "small": small})
    assert r["reference"] == "big", r
    assert r["groups"]["big"]["palette_distance"] == 0.0
    assert r["groups"]["small"]["palette_distance"] > 0.3
