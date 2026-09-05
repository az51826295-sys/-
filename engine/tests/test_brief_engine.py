"""사양서 생성기의 이빨 — north-star-and-map §3-1.

사양서가 **생성물**이어야 하는 이유는 사장님이 레퍼런스나 성경을 바꿨을 때 그것이
자동으로 반영되기 위해서다. 손으로 쓴 문서는 바뀌지 않는다.
"""
import os
import sys

import pytest
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import brief_engine as be                         # noqa: E402
from genesis import style_bible as sb                          # noqa: E402

RAMPED = [(30, 70, 30), (50, 110, 50), (80, 150, 80), (120, 190, 120),
          (70, 45, 25), (110, 75, 40), (150, 110, 65), (190, 150, 100)]
REQ = [{"what": "주인공 마녀", "profile": "character", "note": "작고 귀엽게"}]
# 성경은 임시 폴더에 두지만 **규격 스펙은 진짜 것**을 쓴다. os.path.join 은 두
# 번째가 절대 경로면 그것을 그대로 돌려주므로 root 와 무관하게 찾아진다.
SPEC = os.path.join(ROOT, "data", "image_specs", "pixel-sprite-v2.yaml")


def _bible(tmp_path, name="b"):
    im = Image.new("RGBA", (16, 16))
    px = im.load()
    for y in range(16):
        for x in range(16):
            px[x, y] = RAMPED[(x + y) % len(RAMPED)] + (255,)
    p = tmp_path / "a.png"
    im.save(p)
    return sb.adopt([str(p)], name, chosen_by="사람", root=str(tmp_path))


def _bar(**kw):
    d = {"source": "ref.png", "luma_median": 177.0, "luma_spread": 164.9,
         "saturation_median": 34, "colors": None}
    d.update(kw)
    return d


def test_품질_바_없이는_사양서를_안_만든다(tmp_path):
    """우리 성경을 목표로 삼으면 '목표 달성'이 우리 현재 수준을 뜻하게 된다."""
    _bible(tmp_path)
    with pytest.raises(ValueError) as e:
        be.build("b", REQ, SPEC, bar=None, root=str(tmp_path))
    assert "레퍼런스" in str(e.value)


def test_목표는_레퍼런스지_우리_성경이_아니다(tmp_path):
    b = _bible(tmp_path)
    text = be.build("b", REQ, SPEC, bar=_bar(), root=str(tmp_path))
    assert "**164.9**" in text, "레퍼런스 명암폭이 목표로 안 들어갔다"
    assert f"| {b['luma_spread']} |" in text, "우리 값이 '지금' 열에 없다"


def test_간극을_감추지_않는다(tmp_path):
    b = _bible(tmp_path)
    text = be.build("b", REQ, SPEC, bar=_bar(), root=str(tmp_path))
    gap = b["luma_spread"] - 164.9
    assert f"**{gap:+.0f}**" in text, "간극 열이 없다"


def test_레퍼런스에서_안_잰_축은_목표가_없다(tmp_path):
    """미측정을 우리 값으로 채우면 3값 규율이 깨진다."""
    _bible(tmp_path)
    text = be.build("b", REQ, SPEC, bar=_bar(), root=str(tmp_path))
    assert "(레퍼런스 미측정)" in text


def test_레퍼런스가_바뀌면_사양서가_바뀐다(tmp_path):
    """이게 '생성물'의 전부다 - 안 바뀌면 손으로 쓴 문서와 같다."""
    _bible(tmp_path)
    a = be.build("b", REQ, SPEC, bar=_bar(), root=str(tmp_path))
    z = be.build("b", REQ, SPEC, bar=_bar(luma_spread=90.0), root=str(tmp_path))
    assert a != z
    assert "**90.0**" in z


def test_성경이_바뀌면_사양서가_바뀐다(tmp_path):
    _bible(tmp_path, "b1")
    _bible(tmp_path, "b2")
    a = be.build("b1", REQ, SPEC, bar=_bar(), root=str(tmp_path))
    z = be.build("b2", REQ, SPEC, bar=_bar(), root=str(tmp_path))
    assert "b1" in a and "b2" in z


def test_금지_목록이_사양서에_실린다(tmp_path):
    """금지 규칙이 늘면 사양서도 따라 늘어야 한다 - 손으로 옮기면 어긋난다."""
    from genesis import prompt_book as pb
    _bible(tmp_path)
    text = be.build("b", REQ, SPEC, bar=_bar(), root=str(tmp_path))
    assert text.count("|") > 0
    assert "low saturation" in text
    assert len(pb.BANNED) >= 5
    for _, why in pb.BANNED:
        assert why in text, f"금지 사유가 사양서에 안 실렸다: {why}"


def test_요청_목록이_그대로_실린다(tmp_path):
    _bible(tmp_path)
    text = be.build("b", [{"what": "풀 ↔ 물", "profile": "tile", "note": "wang"}],
                    SPEC, bar=_bar(), root=str(tmp_path))
    assert "풀 ↔ 물" in text and "wang" in text


def test_규격이_스펙_파일에서_온다(tmp_path):
    _bible(tmp_path)
    text = be.build("b", REQ, SPEC, bar=_bar(), root=str(tmp_path))
    assert "pixel-sprite-v2" in text
    assert "48" in text          # v2의 색 상한
