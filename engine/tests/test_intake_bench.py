"""분해기 벤치 시험 — 설계: docs/intake-bench-v0-design.md.

이 벤치의 값어치는 **정답의 출처가 레지스트리**라는 데 있다. 내가 요청 문장을
지어내고 정답을 붙이면 내 엔진을 내가 채점하는 것이므로, 여기서 재는 것은
"선언한 별칭이 실제로 걸리나"라는 계약뿐이다.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools import blueprint_engine as be                  # noqa: E402
from tools import intake_bench as ib                      # noqa: E402

REG = be.load_registry()


def test_expected_is_one_not_a_ratio():
    """성능이 아니라 계약이다 - 등록된 별칭이 안 걸리면 정도 문제가 아니다."""
    assert ib.EXPECTED == 1.0


def test_every_declared_alias_finds_its_atom():
    r = ib.alias_recall(REG)
    assert r["n_aliases"] > 0
    assert r["bare_recall"] == 1.0, r["bare_misses"]
    assert r["carried_recall"] == 1.0, r["carried_misses"]


def test_two_aliases_in_one_sentence_both_survive():
    m = ib.multi_mention(REG)
    assert m["n_pairs"] > 0
    assert m["recall"] == 1.0, m["misses"][:5]


def test_bench_passes_and_says_so():
    res = ib.run(REG)
    assert res["passes"] is True
    assert all(res["gates"].values())


def test_collisions_are_candidates_not_errors():
    """겹침을 '오류'로 세어 성능 숫자를 만들지 않는다(설계 §3)."""
    res = ib.run(REG)
    assert res["n_collision_candidates"] > 0        # 실제로 겹치는 게 있다
    assert "미판정" in res["collision_state"]
    assert res["passes"] is True                    # 후보는 판정에 안 들어간다
    for row in res["collision_candidates"]:
        assert row["short"] in row["long"]
        assert row["short_atom"] != row["long_atom"]


# --- 부록 A: 겹친 자리에서는 긴 별칭이 이긴다 --------------------------------

def test_a_shorter_alias_inside_a_longer_one_is_dropped():
    """오작동 정본: '픽토그램'에 '램'(RAM 부스터)이 딸려 오면 안 된다."""
    found = {a["id"] for a in be.intake("픽토그램 세트 만들어줘", REG)}
    assert "icon_spec_fit" in found
    assert "ram_booster" not in found


def test_the_customer_screen_no_longer_talks_about_ram(capsys):
    be.main(["--want", "픽토그램 세트 만들어줘"])
    out = capsys.readouterr().out
    assert "RAM" not in out and "ram_booster" not in out
    assert "icon_spec_fit" in out


def test_aliases_in_different_places_both_survive():
    """겹칠 때만 거른다 - 서로 다른 자리에 나온 별칭은 둘 다 남는다."""
    found = {a["id"] for a in be.intake("아이콘 하고 배경음 만들어줘", REG)}
    assert "icon_spec_fit" in found or "spec_fit_art_selection" in found
    assert "music_selection" in found


def test_more_specific_alias_wins_when_nested():
    found = {a["id"] for a in be.intake("아이콘 세트 만들어줘", REG)}
    assert "icon_spec_fit" in found                 # 긴 별칭 쪽
    assert "spec_fit_art_selection" not in found    # 그 안에 든 짧은 쪽


def test_result_order_is_stable():
    """분해 순서가 실행마다 흔들리면 아래 단계가 전부 흔들린다."""
    want = "아이콘 하고 음악 하고 스토리"
    first = [a["id"] for a in be.intake(want, REG)]
    assert first == [a["id"] for a in be.intake(want, REG)]
    order = {a["id"]: i for i, a in enumerate(REG)}
    assert first == sorted(first, key=lambda x: order[x])
