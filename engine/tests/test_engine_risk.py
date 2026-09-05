"""Alpha step 6: risk-based candidate budget."""

import pytest

from genesis.rookery.engine.budget import (
    BudgetGuard, BudgetPolicy, RESTRICTED, STOPPED)
from genesis.rookery.engine.risk import (
    HIGH, LOW, MEDIUM, RiskSignals, assess, plan_candidates)
from genesis.rookery.engine.store import Store


@pytest.fixture()
def sg(tmp_path):
    store = Store(str(tmp_path / "e.db"))
    guard = BudgetGuard(store, BudgetPolicy(
        usd_krw=1000.0, fixed_monthly_krw=0.0, daily_krw=1e9,
        task_krw=1e9))
    yield store, guard
    store.close()


def low_signals(**kw) -> RiskSignals:
    base = dict(has_repro_test=True, located_file=True,
                located_symbol=True, covered_by_tests=True,
                files_in_scope=1, prior_attempts=0,
                change_kind="test")
    base.update(kw)
    return RiskSignals(**base)


# ------------------------------------------------------- assessment


def test_low_risk_shape():
    a = assess(low_signals())
    assert a.level == LOW and not a.blocked


@pytest.mark.parametrize("kw,marker", [
    ({"has_repro_test": False, "covered_by_tests": False},
     "재현 테스트 없음"),
    ({"covered_by_tests": False}, "커버리지"),
    ({"prior_attempts": 2}, "이전 시도"),
    ({"files_in_scope": 3}, "3파일"),
    ({"change_kind": "multi"}, "multi"),
])
def test_high_risk_flags(kw, marker):
    a = assess(low_signals(**kw))
    assert a.level == HIGH
    assert any(marker in r for r in a.reasons), a.reasons


@pytest.mark.parametrize("kw", [
    {"located_symbol": False},
    {"prior_attempts": 1},
    {"files_in_scope": 2},
    {"change_kind": "code"},
])
def test_medium_risk_shapes(kw):
    assert assess(low_signals(**kw)).level == MEDIUM


def test_unverifiable_work_is_blocked_entirely():
    """§8.5 product boundary: no auto-work without a checkable spec."""
    a = assess(low_signals(spec_is_checkable=False))
    assert a.blocked and a.level == HIGH
    assert "검증 불가능" in a.block_reason


def test_signals_from_payload():
    s = RiskSignals.from_payload(
        {"test_id": "tests/t.py::a", "file": "pkg/m.py",
         "symbol": "f", "files_in_scope": 2, "change_kind": "code"},
        prior_attempts=1)
    assert s.has_repro_test and s.located_symbol
    assert s.files_in_scope == 2 and s.prior_attempts == 1
    assert assess(s).level == MEDIUM


# ------------------------------------------------------- planning


def test_candidate_counts_by_risk(sg):
    store, guard = sg
    assert plan_candidates(low_signals(), guard).candidates == 1
    assert plan_candidates(low_signals(change_kind="code"),
                           guard).candidates == 2
    assert plan_candidates(low_signals(files_in_scope=3),
                           guard).candidates == 3


def test_all_tasks_drop_to_one_candidate_at_restrict(sg):
    """Spec: from 40,000 KRW every task uses one candidate."""
    store, guard = sg
    r = guard.reserve(40_000.0, task_id="seed")
    guard.settle(r, usd=40.0)
    guard.reserve(1.0, task_id="seed")            # clear overage flag
    assert guard.status().stage == RESTRICTED
    plan = plan_candidates(low_signals(change_kind="code"), guard)
    assert plan.candidates == 1 and plan.stage == RESTRICTED


def test_high_risk_deferred_when_high_cost_restricted(sg):
    store, guard = sg
    r = guard.reserve(40_000.0, task_id="seed")
    guard.settle(r, usd=40.0)
    guard.reserve(1.0, task_id="seed")
    plan = plan_candidates(low_signals(files_in_scope=4), guard)
    assert plan.deferred and plan.candidates == 0
    assert "고위험" in plan.reason


def test_blocked_spec_is_deferred_with_zero_candidates(sg):
    store, guard = sg
    plan = plan_candidates(low_signals(spec_is_checkable=False), guard)
    assert plan.deferred and plan.candidates == 0
    assert "제품 경계" in plan.reason


def test_stop_after_three_failures_is_the_default(sg):
    store, guard = sg
    plan = plan_candidates(low_signals(files_in_scope=3), guard)
    assert plan.candidates == 3 and plan.stop_after_all_fail


def test_plan_is_logged(sg):
    store, guard = sg
    plan_candidates(low_signals(), guard, store=store, task_id="t1")
    events = [e for e in store.events() if e["kind"] == "candidate_plan"]
    assert events, "the candidate decision must be auditable"


def test_stopped_stage_still_plans_one_for_local_replay(sg):
    """At STOPPED no external call is allowed; the plan reflects the
    clamp rather than pretending three candidates are available."""
    store, guard = sg
    r = guard.reserve(45_000.0, task_id="seed")
    guard.settle(r, usd=45.0)
    guard.reserve(1.0, task_id="seed")
    assert guard.status().stage == STOPPED
    plan = plan_candidates(low_signals(), guard)
    assert plan.candidates == 1 and plan.stage == STOPPED
