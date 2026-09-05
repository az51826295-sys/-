"""품질 바의 이빨 — director-ai-vision 2단계.

*"품질 바를 레퍼런스 작품으로 박는다. 추상어 대신 실제 작품을 가리킨다."*
그리고 **남의 팔레트를 가져오지 않는다** — 그 선을 코드가 지키는가.
"""
import os
import sys

import pytest
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import reference_bar as rb                        # noqa: E402


def _img(path, colors, size=64):
    im = Image.new("RGB", (size, size))
    px = im.load()
    for y in range(size):
        for x in range(size):
            px[x, y] = colors[(x + y) % len(colors)]
    im.save(path)
    return str(path)


DARK = [(20, 20, 20), (40, 40, 40), (60, 60, 60)]
WIDE = [(10, 10, 10), (128, 128, 128), (245, 245, 245)]


def test_밝은_그림과_어두운_그림을_가른다(tmp_path):
    d = rb.measure(_img(tmp_path / "d.png", DARK), scale_down=1)
    w = rb.measure(_img(tmp_path / "w.png", WIDE), scale_down=1)
    assert w["luma_median"] > d["luma_median"]
    assert w["luma_spread"] > d["luma_spread"]


def test_팔레트를_가져오지_않는다(tmp_path):
    """남의 작품에서 통계는 뽑되 색은 가져오지 않는다."""
    r = rb.measure(_img(tmp_path / "a.png", WIDE), scale_down=1)
    assert r["palette_taken"] is False
    assert "palette" not in r
    assert "colors" in r and r["colors"] is None


def test_색_수는_미측정으로_남긴다(tmp_path):
    """화면 캡처는 압축으로 색이 부풀려진다. 재지 않은 것을 재지 않았다고 적는다."""
    r = rb.measure(_img(tmp_path / "a.png", WIDE), scale_down=1)
    assert r["colors"] is None
    assert "미측정" in r["colors_note"]


def test_가리킨_사람_없이는_채택이_안_된다(tmp_path):
    p = _img(tmp_path / "a.png", WIDE)
    with pytest.raises(ValueError) as e:
        rb.adopt(p, "x", pointed_by="  ", root=str(tmp_path))
    assert "사람이 정한다" in str(e.value)


def test_채택하고_읽으면_같다(tmp_path):
    p = _img(tmp_path / "a.png", WIDE)
    d = rb.adopt(p, "bar1", pointed_by="사장님", root=str(tmp_path),
                 scale_down=1)
    back = rb.load("bar1", root=str(tmp_path))
    assert back["luma_spread"] == d["luma_spread"]
    assert back["pointed_by"] == "사장님"


def test_잘라내기가_먹는다(tmp_path):
    """레터박스(검은 띠)를 빼야 밝기 중앙값이 안 끌려 내려간다."""
    im = Image.new("RGB", (64, 64), (0, 0, 0))
    for y in range(20, 44):
        for x in range(64):
            im.putpixel((x, y), (230, 230, 230))
    p = tmp_path / "letterbox.png"
    im.save(p)
    whole = rb.measure(str(p), scale_down=1)
    inner = rb.measure(str(p), crop=(0, 20, 64, 44), scale_down=1)
    assert inner["luma_median"] > whole["luma_median"]
