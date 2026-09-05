"""observed.* 증거 등급 + 추출기 G 테스트 (2026-08-26 승인 C). 지출 0.

지키는 것:
1. observed는 measured가 **아니다** — 자율 근거로 세지 않는다.
2. 등록(null 통제 통과) 전에는 observed를 읽는 규칙이 fail이 아니라 undefined다.
3. 다수결은 과반이다. 갈리면 값을 내지 않고, 없는 값을 None으로 채우지 않는다.
4. 선택지 밖의 답은 버린다(비슷한 말로 끼워 맞추지 않는다).
"""
from __future__ import annotations

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools import extractor_g as eg                      # noqa: E402
from tools import judge_bench as jb                      # noqa: E402

SPEC = {
    "kind": "spec_conformance",
    "params": {"rules": [
        {"name": "mood", "measured": "observed.mood", "op": "==",
         "spec": "spec.mood"}]},
    "positive": {"spec": {"mood": "calm"}, "observed": {"mood": "calm"}},
}


# ------------------------------------------------------------- 등급

def test_observed_is_not_measured():
    assert jb.evidence_grade(SPEC) == "observed"
    assert jb.reads_observed(SPEC) is True


def test_measured_still_wins_but_observed_is_still_flagged():
    mixed = json.loads(json.dumps(SPEC))
    mixed["params"]["rules"].append(
        {"name": "bytes", "measured": "measured.bytes", "op": "<=",
         "spec": "spec.max_bytes"})
    assert jb.evidence_grade(mixed) == "measured"   # 잰 값이 결정적이면 measured
    assert jb.reads_observed(mixed) is True         # 그래도 드러낸다


def test_registered_atoms_read_no_observed_yet():
    for a in jb.load_registry():
        assert jb.reads_observed(a.get("judge") or {}) is False, a["id"]


# ------------------------------------------------------------- null 통제 관문

def test_unregistered_observed_field_is_undefined_not_fail(monkeypatch):
    monkeypatch.setattr(jb, "load_observed_controls", lambda path=None: {})
    with pytest.raises(jb.Unjudgeable, match="미등록"):
        jb.run_judge(SPEC, json.loads(json.dumps(SPEC["positive"])))


def test_failed_null_control_is_also_undefined(monkeypatch):
    monkeypatch.setattr(jb, "load_observed_controls", lambda path=None: {
        "observed.mood": {"null_control_passed": False,
                          "null_pass_rate": 0.4, "threshold": 0.05}})
    with pytest.raises(jb.Unjudgeable, match="null 통제 미통과"):
        jb.run_judge(SPEC, json.loads(json.dumps(SPEC["positive"])))


def test_passed_null_control_lets_the_rule_decide(monkeypatch):
    monkeypatch.setattr(jb, "load_observed_controls", lambda path=None: {
        "observed.mood": {"null_control_passed": True,
                          "null_pass_rate": 0.02, "threshold": 0.05}})
    assert jb.run_judge(SPEC, json.loads(json.dumps(SPEC["positive"]))) is True
    wrong = json.loads(json.dumps(SPEC["positive"]))
    wrong["observed"]["mood"] = "tense"
    assert jb.run_judge(SPEC, wrong) is False


def test_shipped_control_file_registers_nothing_yet():
    # 등록은 통제 결과로만 한다 - 손으로 채우면 이 테스트가 걸린다
    assert jb.load_observed_controls() == {}


# ------------------------------------------------------------- 추출기 G

def test_majority_of_three_decides():
    ex = eg.MockExtractor(["calm", "calm", "tense"])
    r = eg.observe("<svg/>", "mood", ex)
    assert r["decided"] is True and r["value"] == "calm"
    assert r["votes"] == ["calm", "calm", "tense"] and ex.calls == 3


def test_a_three_way_split_decides_nothing():
    ex = eg.MockExtractor(["calm", "tense", "bright"])
    r = eg.observe("<svg/>", "mood", ex)
    assert r["decided"] is False and r["value"] is None


def test_answers_outside_the_choices_are_thrown_away():
    ex = eg.MockExtractor(["차분함", "calm", "calm"])
    r = eg.observe("<svg/>", "mood", ex)
    assert r["invalid"] == 1 and r["value"] == "calm"   # 2/3 과반


def test_invalid_answers_cannot_carry_a_majority():
    ex = eg.MockExtractor(["몰라", "몰라", "calm"])
    r = eg.observe("<svg/>", "mood", ex)
    assert r["invalid"] == 2 and r["decided"] is False  # 1표는 과반이 아니다


def test_undecided_fields_are_absent_not_null():
    ex = eg.MockExtractor(["calm", "tense", "bright"])
    out = eg.observe_many("<svg/>", ["mood"], ex)
    assert out["observed"] == {}                  # 키가 아예 없어야 한다
    assert out["undecided"] == ["observed.mood"]


def test_unknown_field_is_refused():
    with pytest.raises(KeyError):
        eg.observe("<svg/>", "돈이_되나", eg.MockExtractor())


def test_paid_extractor_is_locked_without_approval(monkeypatch):
    monkeypatch.delenv("GENESIS_SPEND", raising=False)
    with pytest.raises(RuntimeError, match="GENESIS_SPEND"):
        eg.make_extractor("anthropic")


def test_mock_extractor_spends_nothing(tmp_path, monkeypatch):
    ledger = tmp_path / "l.jsonl"
    monkeypatch.setattr(eg.pz, "LEDGER", str(ledger))
    eg.observe_many("<svg/>", ["mood", "art_style"], eg.MockExtractor())
    assert not ledger.exists()
