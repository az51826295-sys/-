"""스펙 민감도 시험 — 설계: docs/spec-sensitivity-v1-design.md.

여기서 고정하는 것:
- 이 검사 자체가 **이빨을 갖는다**(통과 도장만 찍는 심판은 미달로 나온다).
- 비트는 쪽은 `spec.*`뿐이다. `measured.*`를 건드리면 이빨과 섞여 어느 쪽이
  잡았는지 알 수 없게 된다.
- 구성할 수 없는 것은 통과가 아니라 **미정의**다.
"""
import copy
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools import judge_bench as jb                      # noqa: E402
from tools import spec_sensitivity as ss                 # noqa: E402

REG = jb.load_registry()


def atom(aid: str) -> dict:
    return copy.deepcopy(next(a for a in REG if a["id"] == aid))


def test_frozen_constants():
    # 결과를 보고 내리지 않는다(설계 §2).
    assert ss.THRESHOLD == 1.0
    assert ss.MIN_CONSTRUCTIONS == 3


def test_every_spec_conformance_atom_reads_its_spec():
    res = ss.run_registry(REG)
    graded = [r for r in res["rows"] if r["state"] in ("pass", "fail")]
    assert graded, "채점된 원자가 없다"
    for r in graded:
        assert r["state"] == "pass", f'{r["atom"]}: {r["why"]}'
        assert r["rate"] == 1.0
    assert res["summary"]["passes_strict"] is True


def test_it_has_teeth_against_a_rubber_stamp_judge(monkeypatch):
    """통과 도장만 찍는 심판은 설계도를 바꿔도 그대로다 → 미달이어야 한다."""
    monkeypatch.setattr(jb, "run_judge", lambda spec, sample: True)
    r = ss.run_atom(atom("icon_spec_fit"))
    assert r["state"] == "fail"
    assert r["rate"] == 0.0
    assert "설계도를 안 읽는 규칙" in r["why"]


def test_undefined_is_not_counted_as_a_flip(monkeypatch):
    """미정의를 뒤집힘으로 세면 규율 4(미측정=undefined)가 뒤집힌다."""
    calls = {"n": 0}

    def fake(spec, sample):
        calls["n"] += 1
        if calls["n"] == 1:                 # positive 확인만 통과시킨다
            return True
        raise jb.Unjudgeable("문턱 미동결")
    monkeypatch.setattr(jb, "run_judge", fake)
    r = ss.run_atom(atom("icon_spec_fit"))
    assert r["state"] == "fail"
    assert r["flipped"] == 0
    assert all(row["why"].startswith("미정의")
               for row in r["rows"] if row["flipped"] is False)


def test_only_the_spec_side_is_perturbed():
    a = atom("icon_spec_fit")
    before = copy.deepcopy(a["judge"]["positive"]["measured"])
    for c in ss.constructions(a):
        if c["constructible"]:
            assert c["sample"]["measured"] == before, c["rule"]
            assert c["was"] != c["now"]


def test_ops_without_a_spec_are_declared_not_silently_dropped():
    a = atom("icon_spec_fit")
    rows = {c["rule"]: c for c in ss.constructions(a)}
    assert rows["parse"]["constructible"] is False      # is_null
    assert rows["grid.snap"]["constructible"] is False  # empty
    assert "스펙을 참조하지 않는다" in rows["parse"]["why"]


# --- 부록 A: 종류별 전수 구성 -----------------------------------------------

@pytest.mark.parametrize("aid", ["dangerous_permission_scan",
                                 "phishing_link_check", "cache_cleanup",
                                 "large_file_finder",
                                 "spec_fit_story_selection"])
def test_other_kinds_read_their_spec_too(aid):
    """부록 A1: 규칙 목록이 없는 종류도 설계도 입력이 있으면 전수로 시험한다."""
    r = ss.run_atom(atom(aid))
    assert r["state"] == "pass", r["why"]
    assert r["rate"] == 1.0
    assert r["exhaustive"] is True
    assert r["n"] >= ss.MIN_CONSTRUCTIONS_EXHAUSTIVE


def test_a_judge_without_a_blueprint_is_undefined_not_pass():
    """hash_pairs는 설계도가 관여하지 않는다 - 결함이 아니라 성질이다."""
    r = ss.run_atom(atom("duplicate_file_finder"))
    assert r["state"] == "undefined"
    assert "설계도 입력이 없는 심판" in r["why"]
    assert "구성 규칙 없음" not in r["why"]


def test_kind_builders_are_a_registry_not_name_branches():
    assert set(ss.KIND_BUILDERS) == {"set_membership", "numeric_delta",
                                     "threshold_match", "forbidden_absent"}


def test_impossible_constructions_are_declared_not_counted():
    """적중이 1건뿐이면 '규칙에서 적중 제거'는 공허한 샘플을 만든다 → 구성 불가."""
    rows = {c["rule"]: c
            for c in ss.constructions_by_kind(atom("phishing_link_check"))}
    assert rows["규칙에서 적중 제거"]["constructible"] is False
    assert "공허한 샘플" in rows["규칙에서 적중 제거"]["why"]
    assert rows["규칙에 미적중 추가"]["constructible"] is True


def test_kind_constructions_never_touch_the_candidate_side():
    for aid in ("dangerous_permission_scan", "large_file_finder",
                "spec_fit_story_selection"):
        a = atom(aid)
        before = copy.deepcopy(a["judge"]["positive"].get("measured"))
        claim = copy.deepcopy(a["judge"]["positive"].get("claim"))
        for c in ss.constructions_by_kind(a):
            if c["constructible"]:
                assert c["sample"].get("measured") == before, aid
                assert c["sample"].get("claim") == claim, aid


def test_kind_builder_teeth_against_a_rubber_stamp(monkeypatch):
    monkeypatch.setattr(jb, "run_judge", lambda spec, sample: True)
    r = ss.run_atom(atom("large_file_finder"))
    assert r["state"] == "fail"
    assert r["rate"] == 0.0


def test_too_few_constructions_is_undefined():
    a = atom("icon_spec_fit")
    rules = a["judge"]["params"]["rules"]
    a["judge"]["params"]["rules"] = [r for r in rules
                                     if r["op"] in ("empty", "is_null")][:2]
    r = ss.run_atom(a)
    assert r["state"] == "undefined"
    assert "최소" in r["why"]


def test_non_real_atoms_are_skipped_not_judged():
    human = next((a for a in REG if a.get("verdict") != "real"), None)
    assert human is not None
    assert ss.run_atom(copy.deepcopy(human))["state"] == "skipped"


def test_bump_always_changes_the_value():
    for v in (0, 1.5, "round", ["a"], True):
        assert ss._bump(v) != v


def test_strict_exit_code(capsys):
    assert ss.main(["--strict"]) == 0
    out = capsys.readouterr().out
    assert "스펙 민감도" in out and "문턱 1.0" in out
