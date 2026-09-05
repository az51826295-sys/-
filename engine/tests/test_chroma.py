"""크로마키 분해의 이빨.

핵심은 **자르는 것**이 아니라 **위험할 때 거부하는 것**이다. 초록 나무를 초록
배경에서 자르면 잎이 사라지는데, 그건 조용히 일어나므로 기계가 막아야 한다.
"""
import os
import sys

import pytest
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import chroma                                   # noqa: E402

LEAF = (34, 139, 34)
TRUNK = (92, 64, 40)


def _tree(bg, size=16, path=None):
    """배경 위에 잎덩이 + 줄기. 실제 소품 주문의 축소판. 크기에 맞춰 비례한다."""
    im = Image.new("RGBA", (size, size), bg + (255,))
    px = im.load()
    s = size / 16
    for y in range(int(2 * s), int(10 * s)):
        for x in range(int(3 * s), int(13 * s)):
            px[x, y] = LEAF + (255,)
    for y in range(int(10 * s), int(14 * s)):
        for x in range(int(7 * s), int(9 * s)):
            px[x, y] = TRUNK + (255,)
    if path:
        im.save(path)
    return im


def test_마젠타_배경이면_잎과_줄기가_남는다(tmp_path):
    src = tmp_path / "t.png"
    _tree((255, 0, 255), path=src)
    out = tmp_path / "o.png"
    res = chroma.key_out(str(src), str(out))
    assert res["ok"], res
    got = Image.open(out).convert("RGBA")
    kept = {p[:3] for p in got.get_flattened_data() if p[3] == 255}
    assert LEAF in kept and TRUNK in kept
    # 배경은 전부 잘렸다
    assert got.getpixel((0, 0))[3] == 0
    assert res["kept"] == 8 * 10 + 4 * 2


def test_찐한_녹색_배경에_높은_강도는_거부된다(tmp_path):
    """사장님이 말한 '찐한 녹색'이 실제로 위험한 경우를 기계가 막는가."""
    src = tmp_path / "t.png"
    _tree((0, 100, 0), path=src)
    res = chroma.key_out(str(src), str(tmp_path / "o.png"), strength=0.3)
    assert not res["ok"]
    assert "천장" in res["why"]
    # 거부했으면 파일을 쓰지 않았다
    assert not (tmp_path / "o.png").exists()


def test_찐한_녹색도_강도가_낮으면_된다(tmp_path):
    """거부는 색 탓이 아니라 강도 탓이다 - 낮추면 초록 배경도 잘린다."""
    src = tmp_path / "t.png"
    _tree((0, 100, 0), path=src)
    out = tmp_path / "o.png"
    res = chroma.key_out(str(src), str(out))          # 권장 강도 자동
    assert res["ok"], res
    got = Image.open(out).convert("RGBA")
    kept = {p[:3] for p in got.get_flattened_data() if p[3] == 255}
    assert LEAF in kept, "잎이 지워졌다"
    assert got.getpixel((0, 0))[3] == 0


def test_반투명을_만들지_않는다(tmp_path):
    """픽셀 아트 스펙(alpha_binary)을 태생부터 지킨다."""
    src = tmp_path / "t.png"
    _tree((255, 0, 255), path=src)
    out = tmp_path / "o.png"
    chroma.key_out(str(src), str(out))
    alphas = {p[3] for p in Image.open(out).convert("RGBA").get_flattened_data()}
    assert alphas <= {0, 255}, alphas


def test_안전강도가_키_색에_따라_달라진다(tmp_path):
    """마젠타가 초록보다 여유가 크다 - 색 선택의 근거."""
    g = tmp_path / "g.png"
    m = tmp_path / "m.png"
    _tree((0, 100, 0), path=g)
    _tree((255, 0, 255), path=m)
    assert chroma.safe_strength(str(m))["ceiling"] >         chroma.safe_strength(str(g))["ceiling"]


def test_진짜_잎_색에서_초록키의_여유는_아주_좁다():
    """합성 그림이 아니라 **실제 오디션 팔레트**로 잰다.

    처음에는 합성 나무로 '마젠타가 5배 안전' 을 검사했는데, 5라는 배수는 내가
    지어낸 수였고 합성 그림에서는 4.5배가 나와 떨어졌다. 배수를 낮춰 통과시키는
    대신 **재는 대상**을 진짜 색으로 바꿨다 - 주장은 실제 자산에 대한 것이었다.
    """
    real = os.path.join(ROOT, "audition", "pixellab", "tileset_6.png")
    if not os.path.exists(real):
        pytest.skip("오디션 타일이 없다")
    green = chroma.safe_strength(real, key=(0, 100, 0))["ceiling"]
    magenta = chroma.safe_strength(real, key=(255, 0, 255))["ceiling"]
    # 실측: 초록 0.0720 / 마젠타 0.8479
    assert green < 0.1, f"초록 키가 잎에 이만큼 가깝지 않다: {green}"
    assert magenta > 0.5, f"마젠타 여유가 이렇게 좁을 리 없다: {magenta}"


def test_흐린_가장자리에서는_key_out이_헤일로를_남긴다(tmp_path):
    """08-27 실측 사고를 재현한다 - 이게 despill 이 생긴 이유다.

    GPT풍 입력(흐린 가장자리)에서 `safe_strength` 의 천장은 키와 그림이 섞인
    중간 화소 때문에 0 근처로 무너진다. 그러면 순수 키 색만 지워지고 테두리에
    배경색이 남는다. 규격 검사는 통과하는데 화면에서 형태가 안 읽힌다.
    """
    from PIL import ImageFilter
    src = tmp_path / "blur.png"
    im = _tree((255, 0, 255), size=64)
    im = im.filter(ImageFilter.GaussianBlur(1.5))
    im.convert("RGB").save(src)
    ceiling = chroma.safe_strength(str(src), key=(255, 0, 255))["ceiling"]
    assert ceiling < 0.02, f"흐린 그림인데 천장이 넓다: {ceiling}"


def test_despill이_헤일로를_없앤다(tmp_path):
    from PIL import ImageFilter
    src = tmp_path / "blur.png"
    _tree((255, 0, 255), size=64).filter(
        ImageFilter.GaussianBlur(1.5)).convert("RGB").save(src)
    out = tmp_path / "o.png"
    r = chroma.despill(str(src), str(out), key=(255, 0, 255))
    assert r["ok"] and r["cut"] > 0
    got = Image.open(out).convert("RGBA")
    px = got.load()
    edges = []
    for y in range(64):
        for x in range(64):
            if px[x, y][3] == 0:
                continue
            if any(not (0 <= nx < 64 and 0 <= ny < 64) or px[nx, ny][3] == 0
                   for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))):
                edges.append(px[x, y][:3])
    assert edges, "테두리가 없다"
    # 테두리에 마젠타(빨강·파랑 높고 초록 낮음)가 남아 있으면 안 된다
    magenta = [c for c in edges if c[0] > 150 and c[2] > 150 and c[1] < 100]
    assert not magenta, f"헤일로가 남았다: {magenta[:5]}"


def test_despill은_그림_색을_지우지_않는다(tmp_path):
    """자국을 되돌리다 잎까지 회색으로 만들면 안 된다."""
    src = tmp_path / "t.png"
    _tree((255, 0, 255), size=32, path=src)
    out = tmp_path / "o.png"
    chroma.despill(str(src), str(out), key=(255, 0, 255))
    kept = {p[:3] for p in Image.open(out).convert("RGBA").get_flattened_data()
            if p[3] == 255}
    assert LEAF in kept, "잎이 사라졌다"
    assert TRUNK in kept, "줄기가 사라졌다"


def test_despill도_이진_알파를_지킨다(tmp_path):
    src = tmp_path / "t.png"
    _tree((255, 0, 255), size=32, path=src)
    out = tmp_path / "o.png"
    chroma.despill(str(src), str(out), key=(255, 0, 255))
    alphas = {p[3] for p in Image.open(out).convert("RGBA").get_flattened_data()}
    assert alphas <= {0, 255}, alphas
