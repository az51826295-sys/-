"""마을 지도 생성기 — 배치가 게임을 망가뜨리지 않는가.

예쁨은 안 잰다(사람 게이트). 여기서 보는 것은 첫 판에서 실제로 났던 결함들이다:
길이 집 벽을 관통했고, 40칸짜리 직선 대로가 생겼다.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from tools.artgen import make_village_map as mv               # noqa: E402


def test_생성한_지도가_자기_검사를_통과한다():
    assert mv.check(mv.build()) == []


def test_씨앗이_다르면_다른_지도가_나온다():
    assert mv.build(1) != mv.build(2)


def test_여러_씨앗에서도_제약이_깨지지_않는다():
    """한 씨앗만 맞는 것은 우연이다.

    처음 다섯 씨앗으로 검사했을 때 내가 고른 씨앗은 통과하고 **다른 셋이
    떨어졌다.** 운 좋은 씨앗으로 넘어가면 버그가 그대로 남는다. 문턱을 늘리는
    대신 생성기에 계단과 수리 패스를 넣었고, 이제 범위를 넓게 잡는다.
    """
    bad = [(s, mv.check(mv.build(s))) for s in range(1, 61)]
    bad = [(s, b) for s, b in bad if b]
    assert not bad, bad[:5]


def test_게임에_들어_있는_지도도_같은_검사를_통과한다():
    """생성기가 아니라 **실제로 게임이 읽는 문자열**을 본다."""
    gd = open(os.path.join(ROOT, mv.GD), encoding="utf-8").read()
    i = gd.index('const MAP := """') + len('const MAP := """')
    assert mv.check(gd[i:gd.index('"""', i)]) == []


def test_벽을_관통하는_길을_잡는다():
    """이빨: 첫 판의 결함을 지금 넣으면 거부되는가."""
    rows = [list(r) for r in mv.build().split("\n")]
    # 벽 사이에 길을 억지로 놓는다
    rows[5][10:13] = list("W#W")
    bad = mv.check("\n".join("".join(r) for r in rows))
    assert any("벽 사이" in b for b in bad), bad


def test_직선_대로를_잡는다():
    rows = [list(r) for r in mv.build().split("\n")]
    rows[10][2:38] = list("#" * 36)
    bad = mv.check("\n".join("".join(r) for r in rows))
    assert any("직선" in b for b in bad), bad


def test_시작_칸이_막히면_잡는다():
    rows = [list(r) for r in mv.build().split("\n")]
    x, y = mv.SPAWNS["player"]
    rows[y][x] = "T"
    bad = mv.check("\n".join("".join(r) for r in rows))
    assert any("시작 칸" in b for b in bad), bad


def test_테두리가_열리면_잡는다():
    rows = [list(r) for r in mv.build().split("\n")]
    rows[0][20] = "."
    bad = mv.check("\n".join("".join(r) for r in rows))
    assert any("테두리" in b for b in bad), bad
