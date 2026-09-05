"""재시험 판 — 자리마다 하나, 그리고 **판이 시간을 잰다**(게이트 ②-3).

판을 낸 시각과 기록 시각의 차로 재면 그 사이 다른 일이 전부 섞인다
(실측 132.8분·55.1분 — 5~7자리를 고르는 데 그럴 리 없다). 그래서 페이지가
열린 순간부터 직접 잰다.
"""
import json

from tools import retest_board as rb


def _board():
    return rb.build(round2=True)


def test_the_board_hides_the_first_choice():
    b = _board()
    html = rb.sheet(b)
    for slot in range(1, len(b["concepts"]) + 1):
        assert b["key"].get(f"{slot}:first_choice"), "대조표에 1회차가 없다"
    # 화면에는 1회차 선택이 한 글자도 없어야 한다
    for key, val in b["key"].items():
        if key.endswith(":first_choice"):
            assert val not in html, f"1회차 선택이 판에 샜다: {val}"


def test_the_board_times_itself():
    html = rb.sheet(_board())
    assert "Date.now()" in html and "분" in html
    assert "aria-pressed" in html          # 누를 수 있는 후보
    assert "board_ts" not in html          # 시각은 화면에 안 뿌린다


def test_one_pick_per_slot_is_enforced_in_the_page():
    """한 자리에서 새로 누르면 이전 선택이 풀려야 한다 - 여러 개를 못 고른다."""
    html = rb.sheet(_board())
    assert 'querySelectorAll(\'.cell[data-slot="\' + slot + \'"]\')' in html
    assert 'setAttribute("aria-pressed", "false")' in html


def test_board_records_when_it_was_made():
    b = _board()
    assert b["board_ts"] and b["board_ts"].count(":") == 2


def test_both_answer_formats_parse():
    b = _board()
    n = len(b["concepts"])
    eq = rb._parse_answers(" ".join(f"{i}=1" for i in range(1, n + 1)), b)
    assert sorted(eq) == list(range(1, n + 1))


def test_multi_pick_slots_are_excluded_from_the_verdict():
    """1-of-N 질문에 여러 개로 답하면 그 자리는 판정에서 빠진다(1회차에서 실제로 일어났다)."""
    b = _board()
    res = rb.tally(b, {1: [1, 2], 2: [1]})
    assert res["n"] == 1                      # 하나만 고른 자리만 셈
    assert res["skipped"] and res["skipped"][0]["slot"] == 1
    assert res["inclusive"]["n"] == 2         # 기술 통계에는 둘 다 들어간다
