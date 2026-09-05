"""검토 스톱워치: 단계별 절대 시간만 기록, 이전 단계 자동 종료, 합계."""

import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(os.path.dirname(HERE), "tools", "review_timer.py")


def load():
    spec = importlib.util.spec_from_file_location("review_timer", TOOL)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_stages_are_timed_and_summed(tmp_path):
    m = load()
    log = str(tmp_path / "t.jsonl")
    op = str(tmp_path / "open.json")
    m.start("live-x_1", "판단", log, op, now=1000.0)
    m.start("live-x_1", "초안손질", log, op, now=1300.0)      # 판단 300s 자동 종료
    rec = m.stop(log, op, now=1360.0)
    assert rec["stage"] == "초안손질" and rec["sec"] == 60.0
    assert m.stop(log, op, now=1400.0) is None
    rep = m.report(log)
    assert rep["live-x_1"]["판단"] == 300.0
    assert rep["live-x_1"]["초안손질"] == 60.0
    assert rep["live-x_1"]["합계"] == 360.0
