"""프롬프트 검사의 이빨 — measurement-rules §12.

이 검사가 무디면 08-27의 사고(명암폭 36, 채도 3)가 그대로 반복된다.
누가 쓴 프롬프트든(GPT·사장님·나) 같은 검사를 받는다.
"""
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import prompt_book as pb                          # noqa: E402

GOOD = ("a young witch, wide-brimmed pointed hat, deep shadow under the brim, "
        "bright highlight on the crown, deep plum wool cloak with darker folds, "
        "brass buckles, warm skin tone")


def test_좋은_프롬프트는_통과한다():
    r = pb.lint(GOOD)
    assert r["ok"], r
    assert not r["missing"], r["missing"]


@pytest.mark.parametrize("bad,frag", [
    ("a meadow, no harsh contrast", "no harsh"),
    ("a witch, low saturation", "low saturation"),
    ("desaturated pastel tiles", "desaturated"),
    ("muted colours everywhere", "muted"),
    ("a lineless character sprite", "lineless"),
    ("flat colours only", "flat colours"),
    ("minimal shading please", "minimal shading"),
])
def test_08_27에_당한_표현들을_잡는다(bad, frag):
    """전부 그날 실제로 보냈거나 같은 종류다."""
    r = pb.lint(bad)
    assert not r["ok"], bad
    assert any(frag in b["found"].lower() for b in r["banned"]), r["banned"]


def test_simple_dress는_잡지_않는다():
    """'simple'이 옷을 꾸미는 말이면 정상이다 - 지나치게 물면 못 쓴다."""
    assert pb.lint(GOOD + ", a simple dress")["ok"]


def test_명암을_안_지목하면_경고한다():
    r = pb.lint("a witch with a plum cloak and brass buckles")
    assert r["ok"]                      # 거부는 아니다
    assert any("명암" in m for m in r["missing"])


def test_색을_안_지목하면_경고한다():
    r = pb.lint("a witch, deep shadow under the brim, bright highlight")
    assert any("색" in m for m in r["missing"])


def test_author_없이는_저장이_안_된다(tmp_path):
    """출처가 없으면 프롬프트끼리 비교할 수 없다."""
    with pytest.raises(pb.BadPrompt) as e:
        pb.save({"id": "x", "target": "character", "body": {"description": GOOD}},
                root=str(tmp_path))
    assert "author" in str(e.value)


def test_금지표현이_든_주문은_저장이_거부된다(tmp_path):
    with pytest.raises(pb.BadPrompt) as e:
        pb.save({"id": "x", "author": "gpt", "target": "character",
                 "body": {"description": GOOD + ", muted tones"}},
                root=str(tmp_path))
    assert "§12" in str(e.value)


def test_본문의_모든_문자열_필드를_검사한다(tmp_path):
    """타일셋은 lower/upper/transition 셋이다 - 하나만 보면 새어 나간다."""
    with pytest.raises(pb.BadPrompt):
        pb.save({"id": "t", "author": "gpt", "target": "tileset",
                 "body": {"lower_description": GOOD,
                          "upper_description": "a dirt path, no harsh contrast, "
                                               "deep shadow, plum tones"}},
                root=str(tmp_path))


def test_저장하고_읽으면_같다(tmp_path):
    doc = {"id": "witch1", "author": "gpt-5", "target": "character",
           "body": {"description": GOOD}, "note": "첫 시도"}
    pb.save(doc, root=str(tmp_path))
    back = pb.load("witch1", root=str(tmp_path))
    assert back["author"] == "gpt-5"
    assert back["lint"]["ok"]
