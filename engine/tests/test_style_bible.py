"""스타일 성경의 이빨 — measurement-rules §14.

기준은 **고르는 것**이지 모집단에서 뽑는 것이 아니다. 그 규율을 코드가 강제하는가.
"""
import os
import sys

import pytest
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import style_bible as sb                          # noqa: E402


def _sprite(colors, path, size=16):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = im.load()
    for y in range(size):
        for x in range(size):
            px[x, y] = colors[(x + y) % len(colors)] + (255,)
    im.save(path)
    return str(path)


# 초록 램프 4단계 + 갈색 램프 4단계
RAMPED = [(30, 70, 30), (50, 110, 50), (80, 150, 80), (120, 190, 120),
          (70, 45, 25), (110, 75, 40), (150, 110, 65), (190, 150, 100)]
GREY = [(30, 30, 30), (80, 80, 80), (140, 140, 140), (200, 200, 200)]


def test_사람이_고르지_않으면_채택을_거부한다(tmp_path):
    p = _sprite(RAMPED, tmp_path / "a.png")
    with pytest.raises(sb.NotChosen) as e:
        sb.adopt([p], "x", chosen_by="", root=str(tmp_path))
    assert "§14" in str(e.value)


def test_고른_사람을_적으면_채택된다(tmp_path):
    p = _sprite(RAMPED, tmp_path / "a.png")
    doc = sb.adopt([p], "witch", chosen_by="사장님 2026-08-27",
                   root=str(tmp_path))
    assert doc["chosen_by"].startswith("사장님")
    assert os.path.exists(doc["path"])
    back = sb.load("witch", root=str(tmp_path))
    assert back["colors"] == doc["colors"]


def test_램프를_색상대별_사다리로_묶는다(tmp_path):
    r = sb.ramps(RAMPED)
    assert r["band_count"] >= 2, r          # 초록·갈색
    for band in r["bands"].values():
        assert band["n"] >= sb.MIN_RAMP_STEPS
        assert band["luma"] == sorted(band["luma"]), "어두운 것부터 정렬돼야 한다"


def test_무채색은_램프를_오염시키지_않는다(tmp_path):
    """회색이 아무 색상대에나 흩어지면 램프가 거짓말을 한다."""
    r = sb.ramps(GREY)
    assert r["band_count"] == 0
    assert len(r["grey_steps"]) == 4


def test_흑백_자산은_유채색_램프가_0으로_나온다(tmp_path):
    """마녀A가 실제로 그랬다 - 램프로 보면 한눈에 드러난다."""
    assert sb.ramps(GREY)["band_count"] == 0
    assert sb.ramps(RAMPED)["band_count"] > 0


def test_같은_자산은_성경과_거리가_0이다(tmp_path):
    p = _sprite(RAMPED, tmp_path / "a.png")
    doc = sb.adopt([p], "b", chosen_by="사람", root=str(tmp_path))
    c = sb.compare([p], doc)
    assert c["palette_distance"] == 0.0
    assert c["luma_shift"] == 0.0


def test_다른_세계의_자산은_멀게_나온다(tmp_path):
    a = _sprite(RAMPED, tmp_path / "a.png")
    b = _sprite([(255, 255, 255)], tmp_path / "b.png")
    doc = sb.adopt([a], "b2", chosen_by="사람", root=str(tmp_path))
    c = sb.compare([b], doc)
    assert c["palette_distance"] > 0.2
    assert c["luma_shift"] > 60
    assert c["shared_ramp_bands"] == 0


def test_투명_화소는_안_센다(tmp_path):
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    im.putpixel((8, 8), (30, 70, 30, 255))
    p = tmp_path / "t.png"
    im.save(p)
    doc = sb.adopt([str(p)], "b3", chosen_by="사람", root=str(tmp_path))
    assert doc["colors"] == 1
