"""게임 스모크 — 게이트 ④. 사람이 창을 보는 자리를 기계로 바꾼다.

이 검사가 무의미해지는 길은 하나다: **아무것도 안 해도 통과**가 나오는 것.
그래서 입력을 끊은 주행이 반드시 FAIL이어야 한다(이빨).
"""
import pytest

from tools import game_smoke

pytestmark = pytest.mark.skipif(game_smoke.find_godot() is None,
                                reason="Godot 실행 파일 없음 - 미측정")


def test_the_game_actually_moves_when_pressed():
    res = game_smoke.run()
    assert res["verdict"] == "PASS", res
    # SPEED 110 * 30틱/60fps = 55px. 물리가 실제로 돌았다는 뜻이다.
    assert res["dx_pressed"] == pytest.approx(55.0, abs=1.0)
    assert abs(res["dy_pressed"]) <= 1.0
    assert res["drift_after_release"] <= 1.0
    assert "walk_east" in res["animations_seen"]


def test_the_check_fails_when_nothing_is_pressed():
    """이빨: 입력을 끊으면 반드시 떨어져야 한다."""
    res = game_smoke.run(no_input=True)
    assert res["verdict"] == "FAIL", res
    assert any("안 움직였다" in f for f in res["fail"])


def test_a_missing_engine_is_undefined_not_failure(monkeypatch):
    monkeypatch.setattr(game_smoke, "find_godot", lambda: None)
    res = game_smoke.run()
    assert res["verdict"] == "UNDEFINED"
    assert "못 찾" in res["why"]


def test_korean_failure_messages_survive_the_pipe():
    """이빨: 실패 메시지에 한글이 있어도 판정이 살아남아야 한다.

    이 기계 기본 코드페이지는 cp949다. `text=True`로 읽으면 Godot이 낸 한글
    실패 메시지에서 디코딩이 터지고, 출력이 통째로 사라져 **FAIL이 UNDEFINED로
    둔갑**한다. 통과할 때는 한글이 없어서 오래 안 보였다.
    """
    res = game_smoke.run(no_input=True)
    assert res["verdict"] == "FAIL", res
    assert any("움직" in f for f in res["fail"]), res["fail"]
