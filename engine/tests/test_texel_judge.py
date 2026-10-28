"""도트 크기 자를 재는 자. **정답을 아는 그림만 쓴다.**

왜 합성 그림인가: 실제 자산은 "정답"이 없다. 깨끗한 16배 확대는 도트가 **16이
맞다** — 내가 그렇게 만들었으니까. 그 그림으로만 자가 0 과 1 을 가르는지 볼 수
있다. 실제 스프라이트는 그 뒤에 대조군으로 같이 돌린다.

사보타주: `TEXEL_SABOTAGE=<번호> pytest tests/test_texel_judge.py`

**문턱만 흔드는 사보타주는 약하다.** 처음에 `MIN_TRACE=0`·`MIN_PURITY=0` 만
심었더니 21개 중 2개만 잡혔다 — 자의 **재는 쪽**은 손도 안 댔으니 당연하다.
그래서 계산을 망가뜨리는 것으로 바꿨다. 각 고장은 `tools/texel_sabotage.py` 가
한 번에 돌려 "몇 개가 잡히나"를 센다.

  1 격자 흔적 문턱을 0 으로 (격자 없는 것을 있다고 부른다)
  2 순도 문턱을 0 으로 (믹스드 픽셀을 다 통과)
  3 **알파를 안 본다** (실루엣 반투명을 못 본다 — RGB 만 보던 옛 자의 고장)
  4 격자를 **제일 작은 것**으로 집는다 (도트 16 을 2 로 읽는다)
  5 격자 **시작점을 늘 0** 으로 둔다 (잘린 그림에서 칸을 비껴 센다)

기대값에 조건을 넣지 않는다 — 심어도 통과하면 자가 눈이 없는 것이다(09-21).
"""
from __future__ import annotations

import os

import numpy as np
import pytest
from PIL import Image

from genesis import texel_judge as tj

심기 = os.environ.get("TEXEL_SABOTAGE", "")

if 심기 == "1":
    tj.MIN_TRACE = 0.0
elif 심기 == "2":
    tj.MIN_PURITY = 0.0
elif 심기 == "3":
    def _rgb_only(a):
        b = a[..., :3]
        dx = np.abs(np.diff(b, axis=1)).max(axis=2)
        dy = np.abs(np.diff(b, axis=0)).max(axis=2)
        return (dx > tj.EDGE_DELTA).sum(axis=0), (dy > tj.EDGE_DELTA).sum(axis=1)
    tj._edge_counts = _rgb_only
    _참_purity = tj._purity

    def _purity_rgb(a, s, ox, oy):
        b = a.copy()
        b[..., 3] = 255
        return _참_purity(b, s, ox, oy)
    tj._purity = _purity_rgb
elif 심기 == "4":
    _참_period = tj._period

    def _period_small(edge, limit):
        r = _참_period(edge, limit)
        if r.get("clean"):
            total = float(edge.sum())
            pos = np.arange(1, len(edge) + 1)
            for s in range(2, limit + 1):
                sums = np.bincount(pos % s, weights=edge.astype(float), minlength=s)
                if float(sums.max() / total) >= tj.ALIGN_BAR:
                    r["clean"] = {"texel": s, "align": 1.0,
                                  "offset": int(sums.argmax())}
                    break
        return r
    tj._period = _period_small
elif 심기 == "5":
    _참_purity5 = tj._purity
    tj._purity = lambda a, s, ox, oy: _참_purity5(a, s, 0, 0)


@pytest.fixture(scope="module")
def art() -> Image.Image:
    """**색을 18개 쓴다.** 처음엔 5색이었는데, 운영에서 돌려 보니 `colors 5 < 16`
    이 먼저 떨어져서 도트 칸이 통과했는지 어긋났는지 글만 보고는 알 수가 없었다.
    다른 축이 떨어지는 그림으로는 이 축을 못 잰다(09-21: 심은 고장이 잘 만들어져야).
    """
    n = 24
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    px = img.load()
    pal = [(40, 30, 60, 255), (120, 60, 90, 255), (220, 180, 120, 255),
           (70, 110, 140, 255), (240, 240, 230, 255), (200, 70, 70, 255),
           (90, 160, 90, 255), (160, 140, 200, 255), (250, 210, 80, 255),
           (30, 90, 110, 255), (180, 100, 140, 255), (110, 110, 60, 255),
           (60, 60, 150, 255), (230, 140, 60, 255), (140, 200, 210, 255),
           (85, 40, 40, 255), (205, 205, 160, 255), (20, 20, 35, 255)]
    for y in range(n):
        for x in range(n):
            if (x - n / 2) ** 2 + (y - n / 2) ** 2 > (n / 2 - 1) ** 2:
                continue
            px[x, y] = pal[(x // 3 + y * 7 // 4) % len(pal)]
    return img


def _save(img: Image.Image, d, name: str) -> str:
    p = os.path.join(str(d), name + ".png")
    img.save(p)
    return p


# ── 깨끗한 확대: 도트 크기를 정확히 읽는가 ──────────────────────────

@pytest.mark.parametrize("mult", [4, 8, 12, 16, 32])
def test_깨끗한_확대의_도트_크기를_읽는다(art, tmp_path, mult):
    p = _save(art.resize((24 * mult, 24 * mult), Image.NEAREST), tmp_path, f"x{mult}")
    m = tj.measure_one(p)
    assert m["texel"] == mult, m
    assert m["grid"] == "깨끗"
    assert m["align"] == 1.0
    assert m["purity"] == 1.0
    assert m["logical"] == [24, 24]


def test_깨끗한_확대는_통과한다(art, tmp_path):
    p = _save(art.resize((384, 384), Image.NEAREST), tmp_path, "clean")
    r = tj.judge([p], want_texel=16)
    assert r["verdict"] == "PASS", r["fail"] + r["undefined"]


def test_주문과_다른_도트는_떨어진다(art, tmp_path):
    p = _save(art.resize((384, 384), Image.NEAREST), tmp_path, "clean8")
    r = tj.judge([p], want_texel=8)
    assert r["verdict"] == "FAIL"
    assert any("주문" in f for f in r["fail"])


# ── 믹스드 픽셀: 칸 안이 한 색이 아닌 것을 잡는가 ────────────────────

def test_칸_안을_섞으면_순도가_떨어진다(art, tmp_path):
    """깨끗한 16배에 **격자는 그대로 두고** 칸 안만 흐린다.

    이렇게 심어야 순도 축만 움직인다. 격자까지 망가뜨리면 어느 칸이 잡았는지
    모른다(심은 고장이 잘 만들어져야 한다 — 09-21).
    """
    from PIL import ImageFilter
    big = art.resize((384, 384), Image.NEAREST).filter(ImageFilter.GaussianBlur(1.2))
    p = _save(big, tmp_path, "blurred")
    m = tj.measure_one(p)
    assert m["purity"] is not None, m
    assert m["purity"] < 0.98, m
    r = tj.judge([p], want_texel=16)
    assert r["verdict"] == "FAIL"
    assert any("순도" in f for f in r["fail"])


def test_실루엣_반투명을_믹스드로_센다(art, tmp_path):
    """알파만 흐린다. RGB 는 손 하나 안 댄다 — RGB 만 보던 자가 놓치던 고장이다."""
    big = art.resize((384, 384), Image.NEAREST)
    r_, g_, b_, a_ = big.split()
    from PIL import ImageFilter
    big = Image.merge("RGBA", (r_, g_, b_, a_.filter(ImageFilter.GaussianBlur(1.5))))
    p = _save(big, tmp_path, "softedge")
    m = tj.measure_one(p)
    assert m["purity"] is not None and m["purity"] < 0.98, m


# ── 흐트러진 격자: 비정수 배율을 "격자 없음"으로 흘리지 않는가 ──────────

@pytest.mark.parametrize("w", [372, 380, 390])
def test_비정수_배율은_흐트러짐으로_잡힌다(art, tmp_path, w):
    p = _save(art.resize((w, w), Image.NEAREST), tmp_path, f"non{w}")
    m = tj.measure_one(p)
    assert m["grid"] == "흐트러짐", m
    r = tj.judge([p])
    assert r["verdict"] == "FAIL"
    assert any("흐트러" in f for f in r["fail"])


def test_흐트러진_격자는_도트_크기를_지어내지_않는다(art, tmp_path):
    """**운영에서 잡힌 것.** 진짜 도트 16 인 흐린 그림에 "도트 48" 이라고 적었다.

    망가진 격자에서는 진짜 주기의 배수도 똑같이 흔적을 남긴다. 실측으로 확인했다 —
    줄였다 늘린 것(진짜 16)은 작은 후보가 맞고, 비정수 15.5배(진짜 31)는 큰 후보가
    맞다. 둘 다 맞는 규칙이 없으면 **모른다고 적는 것이 맞다.**

    같이 본다: 모르는 수로 "직사각이다"·"세트가 다르다" 를 말하지 않는지.
    틀린 '틀림' 하나가 멀쩡한 코드를 세 바퀴 고치게 만든다.
    """
    from PIL import ImageFilter
    big = art.resize((384, 384), Image.NEAREST).filter(ImageFilter.GaussianBlur(1.2))
    p = _save(big, tmp_path, "blur_guess")
    m = tj.measure_one(p)
    assert m["grid"] == "흐트러짐", m
    assert m["texel"] is None, m           # 48 이라고 적던 자리
    assert m["logical"] is None, m
    assert len(m["texel_guess"]) == 2
    assert m["purity_at"] and m["purity"] is not None
    r = tj.judge([p], want_texel=16)
    assert r["verdict"] == "FAIL"
    assert any("도트 크기는 못 읽는다" in f for f in r["fail"]), r["fail"]
    assert not any("네모가 아니라" in f for f in r["fail"]), r["fail"]
    assert not any("≠ 주문" in f for f in r["fail"]), r["fail"]


def test_흐트러진_것은_세트_일치_셈에_안_들어간다(art, tmp_path):
    """깨끗한 16 짜리 하나 + 흐트러진 것 하나. "도트 크기가 다르다" 가 나오면
    못 읽은 수로 어긋남을 지어낸 것이다."""
    from PIL import ImageFilter
    a = _save(art.resize((384, 384), Image.NEAREST), tmp_path, "mix_clean")
    b = _save(art.resize((384, 384), Image.NEAREST)
                 .filter(ImageFilter.GaussianBlur(1.2)), tmp_path, "mix_blur")
    r = tj.judge([a, b])
    assert not any("도트 크기가 다르다" in f for f in r["fail"]), r["fail"]
    assert any("흐트러" in f for f in r["fail"]), r["fail"]


def test_줄였다_늘린_것도_잡힌다(art, tmp_path):
    big = (art.resize((384, 384), Image.NEAREST)
              .resize((300, 300), Image.BILINEAR)
              .resize((384, 384), Image.NEAREST))
    p = _save(big, tmp_path, "downup")
    r = tj.judge([p])
    assert r["verdict"] == "FAIL", r


# ── 격자 없음: 못 잼이어야 하고 실패여서는 안 된다 ────────────────────

def test_원본_해상도는_못_잼이지_실패가_아니다(art, tmp_path):
    p = _save(art, tmp_path, "native")
    m = tj.measure_one(p)
    assert m["grid"] == "없음", m
    assert m["purity"] is None
    r = tj.judge([p])
    assert r["verdict"] == "UNDEFINED", r
    assert r["fail"] == []


def test_격자_없음에_주문을_주면_잡힌다(art, tmp_path):
    """자가 혼자 못 가르는 칸이 주문 하나로 열린다. 그게 문서에 적힌 길이다."""
    p = _save(art.resize((384, 384), Image.BICUBIC), tmp_path, "mush")
    r = tj.judge([p], want_texel=16)
    assert r["verdict"] == "FAIL", r
    assert any("주문" in f for f in r["fail"])


def test_잘린_그림도_격자_시작점을_찾는다(art, tmp_path):
    """**이 시험이 없어서 사보타주 5번(시작점을 늘 0으로)이 안 잡혔다.**

    그림이 격자에 딱 맞게 시작한다는 보장이 없다 — 화면을 잘라 온 자산은
    거의 늘 비껴 있다. 그때 칸을 비껴 세면 깨끗한 도트가 "믹스드 픽셀"로 떨어진다.
    """
    big = art.resize((384, 384), Image.NEAREST).crop((5, 11, 384, 384))
    p = _save(big, tmp_path, "cropped")
    m = tj.measure_one(p)
    assert m["texel"] == 16, m
    assert m["purity"] == 1.0, m        # 비껴 세면 여기가 1.0 이 안 된다


def test_단색은_못_잼이다(tmp_path):
    p = _save(Image.new("RGBA", (64, 64), (10, 20, 30, 255)), tmp_path, "flat")
    m = tj.measure_one(p)
    assert m["texel"] is None and m["grid"] == "못 잼", m
    r = tj.judge([p])
    assert r["verdict"] == "UNDEFINED" and r["fail"] == [], r


# ── 세트: 투구 16 · 몸 12 를 잡는가 ─────────────────────────────────

def test_세트_안에_다른_도트가_섞이면_떨어진다(art, tmp_path):
    a = _save(art.resize((384, 384), Image.NEAREST), tmp_path, "set16")
    b = _save(art.resize((288, 288), Image.NEAREST), tmp_path, "set12")
    r = tj.judge([a, b])
    assert r["verdict"] == "FAIL", r
    assert any("도트 크기가 다르다" in f for f in r["fail"])
    assert r["texel_min"] == 12 and r["texel_max"] == 16


def test_같은_도트_세트는_통과한다(art, tmp_path):
    ps = [_save(art.rotate(90 * i).resize((384, 384), Image.NEAREST),
                tmp_path, f"dir{i}") for i in range(4)]
    r = tj.judge(ps, want_texel=16)
    assert r["verdict"] == "PASS", r["fail"] + r["undefined"]
    assert r["match"] is True


def test_한_장이면_세트_일치는_못_잼(art, tmp_path):
    p = _save(art.resize((384, 384), Image.NEAREST), tmp_path, "one")
    r = tj.judge([p], want_texel=16)
    assert r["match"] is None
    assert r["verdict"] == "PASS"       # 못 잼 한 줄이 통과를 깨지 않는다


# ── 직사각 도트 ───────────────────────────────────────────────────

def test_가로세로_도트가_다르면_떨어진다(art, tmp_path):
    p = _save(art.resize((384, 192), Image.NEAREST), tmp_path, "stretch")
    m = tj.measure_one(p)
    assert m.get("square") is False, m
    r = tj.judge([p])
    assert any("네모가 아니라" in f for f in r["fail"]), r


# ── 대조군: 우리가 실제로 쓰는 스프라이트 ────────────────────────────

def test_두근도트_스프라이트는_깨끗한_도트다():
    """실제 자산 위에서도 자가 같은 답을 내는지. 합성만 보면 실물에서 깨진다."""
    import glob
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ps = sorted(glob.glob(os.path.join(root, "work", "dot-이사", "sprites",
                                       "haru", "*.png")))
    if not ps:
        pytest.skip("두근도트 스프라이트가 이 기계에 없다")
    r = tj.judge(ps)
    assert r["texel"] == 8, r
    assert r["purity"] == 1.0, r
    assert r["match"] is True
    assert r["fail"] == [], r["fail"]
