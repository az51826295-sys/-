"""Product-layer checks for the regression guard (design §8.5).

Pure unit tests with stub runners - no repos, no network.
"""

import os

from genesis.rookery.regression_guard import (
    GuardVerdict, RegressionGuard, champion_rank, map_tests)

TEST_FILE = '''
import pkg.mod


class ThingTests:
    def test_uses_target(self):
        assert pkg.mod.target_func(1) == 1

    def test_unrelated(self):
        assert 2 == 2


def test_module_level_target():
    assert pkg.mod.target_func(0) == 0
'''


def _repo(tmp_path):
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_mod.py").write_text(TEST_FILE,
                                                    encoding="utf-8")
    return str(tmp_path)


def _lister(_wt):
    return ["tests/test_mod.py"]


def test_mapping_selects_only_referencing_tests(tmp_path):
    wt = _repo(tmp_path)
    ids = map_tests(wt, [("pkg/mod.py", "target_func")], _lister)
    assert "tests/test_mod.py::ThingTests::test_uses_target" in ids
    assert "tests/test_mod.py::test_module_level_target" in ids
    assert not any("unrelated" in i for i in ids)


def test_mapping_respects_cap(tmp_path):
    wt = _repo(tmp_path)
    ids = map_tests(wt, [("pkg/mod.py", "target_func")], _lister, cap=1)
    assert len(ids) == 1


def test_unmapped_symbol_yields_no_tests(tmp_path):
    wt = _repo(tmp_path)
    assert map_tests(wt, [("pkg/other.py", "zzz_none")], _lister) == []


def test_blocks_on_mapped_failure(tmp_path):
    wt = _repo(tmp_path)
    guard = RegressionGuard(
        run_tests=lambda w, ids: ("fail", "boom"), list_test_files=_lister)
    v = guard.check(wt, [("pkg/mod.py", "target_func")], smoke_ids=[])
    assert v.blocked and v.reason == "regression_detected"
    assert v.failed_ids and not v.used_fallback


def test_passes_when_mapped_tests_pass(tmp_path):
    wt = _repo(tmp_path)
    guard = RegressionGuard(
        run_tests=lambda w, ids: ("pass", ""), list_test_files=_lister)
    v = guard.check(wt, [("pkg/mod.py", "target_func")], smoke_ids=[])
    assert not v.blocked and v.reason == "clean" and v.mapped_ids


def test_fallback_to_fixed_smoke_when_mapping_fails(tmp_path):
    wt = _repo(tmp_path)
    calls = []

    def run(w, ids):
        calls.append(ids[0])
        return ("pass", "")

    guard = RegressionGuard(run_tests=run, list_test_files=_lister)
    v = guard.check(wt, [("pkg/other.py", "zzz_none")],
                    smoke_ids=["tests/test_mod.py::test_unrelated"])
    assert v.used_fallback and v.reason == "no_mapped_regression_test"
    assert not v.blocked
    assert calls == ["tests/test_mod.py::test_unrelated"], \
        "fallback must run the FIXED smoke, never arbitrary tests"


def test_baseline_failing_test_cannot_indict(tmp_path):
    """A test already red on the clean tree is dropped from the
    mapped set - the candidate is not responsible for it."""
    wt = _repo(tmp_path)
    guard = RegressionGuard(
        run_tests=lambda w, ids: ("fail", ""), list_test_files=_lister)
    v = guard.check(wt, [("pkg/mod.py", "target_func")],
                    smoke_ids=[], clean_worktree=wt)
    assert v.mapped_ids == []
    assert v.used_fallback and not v.blocked


def test_prescreen_gate_skips_work(tmp_path):
    wt = _repo(tmp_path)
    guard = RegressionGuard(
        run_tests=lambda w, ids: 1 / 0, list_test_files=_lister)
    v = guard.check(wt, [("pkg/mod.py", "target_func")], smoke_ids=[],
                    prescreen_passed=False)
    assert not v.blocked and v.reason == "not_prescreened"


def test_time_budget_stops_early(tmp_path):
    wt = _repo(tmp_path)
    guard = RegressionGuard(
        run_tests=lambda w, ids: ("pass", ""), list_test_files=_lister,
        max_seconds=-1.0)
    v = guard.check(wt, [("pkg/mod.py", "target_func")], smoke_ids=[])
    assert v.reason == "time_budget_exceeded" and v.tests_run == 0


def test_champion_rank_order():
    clean = GuardVerdict(False, "clean", mapped_ids=["a"])
    blocked = GuardVerdict(True, "regression_detected")
    assert champion_rank(True, clean) == 2
    assert champion_rank(True, None) == 1
    assert champion_rank(True, blocked) == 0, \
        "a guard-blocked candidate must never be champion-eligible"
    assert champion_rank(False, clean) == 0
