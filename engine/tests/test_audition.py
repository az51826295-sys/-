"""오디션의 이빨 — 엔진 본체가 규율을 실제로 강제하는가.

measurement-rules §15. 이 모듈이 무디면 제품이 도박으로 되돌아간다.
"""
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import audition as au                             # noqa: E402


def _judge_by_score(cand):
    s = cand["score"]
    if s is None:
        return {"verdict": "UNDEFINED", "undefined": ["점수를 못 쟀다"]}
    return ({"verdict": "PASS"} if s >= 5
            else {"verdict": "FAIL", "fail": [f"점수 {s} < 5"]})


def test_n이_작으면_거부한다():
    """하나만 뽑아 쓰는 것은 판정이 아니라 도박이다 - 조용히 넘어가지 않는다."""
    with pytest.raises(au.NotAnAudition) as e:
        au.audition(lambda i: {"score": 9}, _judge_by_score, n=1)
    assert "도박" in str(e.value)


def test_의도적으로_작게_할_수는_있다():
    r = au.audition(lambda i: {"score": 9}, _judge_by_score, n=1,
                    allow_small=True)
    assert r["counts"]["passed"] == 1


def test_통과와_탈락을_가른다():
    r = au.audition(lambda i: {"score": i}, _judge_by_score, n=8)
    assert r["counts"]["passed"] == 3          # 5,6,7
    assert r["counts"]["rejected"] == 5        # 0..4


def test_미정은_탈락이_아니다():
    """3값 규율: 못 잰 것을 떨어뜨리면 심판이 거짓말을 한다."""
    r = au.audition(lambda i: {"score": None if i == 0 else 9},
                    _judge_by_score, n=4)
    assert r["counts"]["undefined"] == 1
    assert r["counts"]["rejected"] == 0
    assert r["counts"]["passed"] == 3


def test_한_회차가_터져도_나머지가_돈다():
    """돈을 쓴 회차를 한 번의 예외로 버리지 않는다(measurement-rules §5)."""
    def make(i):
        if i == 2:
            raise RuntimeError("연결이 끊겼다")
        return {"score": 9}
    r = au.audition(make, _judge_by_score, n=5)
    assert r["counts"]["errors"] == 1
    assert r["counts"]["passed"] == 4


def test_심판이_터지면_미정이지_탈락이_아니다():
    def bad(cand):
        raise ValueError("자가 고장났다")
    r = au.audition(lambda i: {"score": 9}, bad, n=3)
    assert r["counts"]["undefined"] == 3
    assert r["counts"]["rejected"] == 0


def test_기계가_고르지_않는다():
    """통과분에 순위·최고점이 없다. 마지막 칸은 사람 것이다."""
    r = au.audition(lambda i: {"score": 5 + i}, _judge_by_score, n=4)
    assert [x["i"] for x in r["passed"]] == [0, 1, 2, 3]   # 뽑은 순서 그대로
    assert "best" not in r and "winner" not in r and "ranked" not in r
    assert "고르지 않았다" in r["note"]


def test_통과가_0이면_그렇게_말한다():
    r = au.audition(lambda i: {"score": 0}, _judge_by_score, n=3)
    assert r["counts"]["passed"] == 0
    assert "떨어진 것 중에서 고르지 않는다" in au.summary(r)
