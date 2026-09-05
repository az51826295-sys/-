"""Goodhart 계측 (docs/goodhart-metric-design.md 동결 정의)의 순수 계산부.
원장·네트워크 없이 후보·상태·PR 상태만으로 검사한다."""

import importlib.util
import os
from types import SimpleNamespace

HERE = os.path.dirname(os.path.abspath(__file__))
GH = os.path.join(os.path.dirname(HERE), "tools", "goodhart.py")


def load():
    spec = importlib.util.spec_from_file_location("goodhart", GH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def cands(*ids):
    return [SimpleNamespace(task_id=i) for i in ids]


def test_ratios_follow_the_frozen_definitions():
    gh = load()
    state = {
        "t1": {"state": "submitted", "pr_url": "u1", "fixup": True},
        "t2": {"state": "submitted", "pr_url": "u2"},
        "t3": {"state": "dismissed"},
        "t4": {"state": "new"},                 # 검토 대기 - 분모 제외
    }
    pr = {"u1": "merged", "u2": "open"}
    r = gh.compute(cands("t1", "t2", "t3", "t4"), state, pr)
    assert r["adopted"] == 4 and r["pending_review"] == 1
    assert r["G_a"] == round(2 / 3, 4), "제출/검토완료(submitted+dismissed)"
    assert r["G_c"] == 0.5, "제출 2건 중 손질 없이 나간 것 1"
    assert r["G_b"] == 1.0 and r["open"] == 1, "open은 G-b 분모 제외"


def test_no_denominator_means_none_not_zero():
    gh = load()
    r = gh.compute(cands("t1"), {"t1": {"state": "new"}}, {})
    assert r["G_a"] is None and r["G_b"] is None and r["G_c"] is None


def test_alarm_on_drop_against_moving_average():
    gh = load()
    hist = [{"date": "2026-08-10", "G_a": 1.0, "G_c": 0.9},
            {"date": "2026-08-15", "G_a": 1.0, "G_c": 0.9},
            {"date": "2026-07-01", "G_a": 0.0, "G_c": 0.0}]   # 창 밖
    cur = {"G_a": 0.75, "G_b": None, "G_c": 0.9}
    al = gh.alarms(hist, cur, today="2026-08-22")
    assert len(al) == 1 and al[0].startswith("G_a 0.75")
    assert gh.alarms([], cur, today="2026-08-22") == [], "이력 없으면 알람 없음"


def test_history_upsert_is_one_row_per_day():
    gh = load()
    h = gh.upsert_today([{"date": "2026-08-22", "G_a": 0.5}],
                        {"date": "2026-08-22", "G_a": 0.8})
    assert h == [{"date": "2026-08-22", "G_a": 0.8}]
