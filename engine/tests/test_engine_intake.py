"""Alpha step 5: failure log -> task intake.

The point of these tests is the refusals. Anything that admits an
instrument bug, a transient API error or a flaky test as work would
have the engine teaching itself its own noise.
"""

import pytest

from genesis.rookery.engine.intake import (
    FailureIntake, FailureRecord, G_CATEGORY, G_DUPLICATE,
    G_EVALUATOR, G_REPRO, G_VALUE, IntakeConfig, ReproResult,
    normalize)
from genesis.rookery.engine.store import Store


def always_repro(f):
    return ReproResult(reproduced=True, runs=3, failures=3)


@pytest.fixture()
def store(tmp_path):
    s = Store(str(tmp_path / "e.db"))
    yield s
    s.close()


@pytest.fixture()
def intake(store):
    return FailureIntake(store, IntakeConfig(),
                         reproduce=always_repro)


def rec(**kw) -> FailureRecord:
    base = dict(source="test", kind="assertion_error",
                message="AssertionError: expected 3 got 4",
                task_id="orig", test_id="tests/test_m.py::test_a",
                file="pkg/mod.py", occurrences=2)
    base.update(kw)
    return FailureRecord(**base)


# ------------------------------------------------------- fingerprints


def test_normalize_strips_volatile_noise():
    a = normalize("Error at 0x7ffe1234 line 42 in C:\\tmp\\x.py "
                  "at 2026-08-03 10:00:00 took 1.5s")
    b = normalize("Error at 0xdeadbeef line 99 in C:\\tmp\\y.py "
                  "at 2026-08-04 11:00:00 took 9.9s")
    assert a == b, "same failure must fingerprint identically"


def test_signature_differs_for_different_failures():
    assert rec().signature() != rec(message="TypeError: nope"
                                    ).signature()
    assert rec().signature() != rec(file="pkg/other.py").signature()


# ------------------------------- G0: categories that are never tasks


@pytest.mark.parametrize("kind", [
    "api_transient", "api_credit", "api_auth", "budget_stop",
    "audit_disagree", "env_setup_fail", "policy_blocked",
])
def test_non_task_categories_refused(intake, kind):
    d = intake.submit(rec(kind=kind))
    assert not d.admitted and d.gate == G_CATEGORY and d.code == kind


def test_audit_disagreement_never_becomes_a_task(intake, store):
    """An instrument problem needs a human, not a patch."""
    d = intake.submit(rec(source="audit", kind="audit_disagree"))
    assert not d.admitted
    assert store.counts() == {}, "no task may be created"


# --------------------------------------------- G1: reproducibility


def test_non_reproducible_refused(store):
    ik = FailureIntake(store, reproduce=lambda f: ReproResult(
        reproduced=False, runs=3, failures=0))
    d = ik.submit(rec())
    assert not d.admitted and d.gate == G_REPRO
    assert d.code == "not_reproducible"


def test_flaky_failure_refused(store):
    ik = FailureIntake(store, reproduce=lambda f: ReproResult(
        reproduced=True, runs=3, failures=1, flaky=True))
    d = ik.submit(rec())
    assert not d.admitted and d.code == "flaky"


def test_partial_failure_counts_as_flaky(store):
    ik = FailureIntake(store, reproduce=lambda f: ReproResult(
        reproduced=True, runs=3, failures=2))
    assert ik.submit(rec()).code == "flaky"


def test_missing_reproducer_refuses(store):
    ik = FailureIntake(store)                    # no reproduce hook
    d = ik.submit(rec())
    assert not d.admitted and d.code == "no_reproducer"


# ------------------------------------------- G2: evaluator sanity


def test_all_tests_errored_is_environment_not_task(intake):
    d = intake.submit(rec(meta={"all_tests_errored": True}))
    assert not d.admitted and d.gate == G_EVALUATOR
    assert d.code == "evaluator_broken"


def test_test_that_fails_under_reference_is_invalid(intake):
    d = intake.submit(rec(meta={"reference_fails": True}))
    assert not d.admitted and d.code == "test_invalid"


def test_evaluator_health_hook(store):
    ik = FailureIntake(store, reproduce=always_repro,
                       evaluator_ok=lambda f: (False, "판정기 점검 중"))
    d = ik.submit(rec())
    assert not d.admitted and d.code == "evaluator_unhealthy"


# ---------------------------------------------------- G3: duplicates


def test_duplicate_refused_and_points_at_existing(intake):
    first = intake.submit(rec())
    assert first.admitted
    again = intake.submit(rec())
    assert not again.admitted and again.gate == G_DUPLICATE
    assert again.task_id == first.task_id


def test_duplicate_check_survives_completion(intake, store):
    first = intake.submit(rec())
    store.complete(store.claim("w1"))
    again = intake.submit(rec())
    assert not again.admitted and again.gate == G_DUPLICATE, \
        "a solved failure must not come back as new work"


def test_noise_only_difference_is_still_duplicate(intake):
    intake.submit(rec(message="AssertionError: expected 3 got 4 "
                              "at line 12"))
    d = intake.submit(rec(message="AssertionError: expected 3 got 4 "
                                  "at line 87"))
    assert not d.admitted and d.gate == G_DUPLICATE


# --------------------------------------------- G4: value / actionable


def test_unlocatable_failure_refused(store):
    ik = FailureIntake(store, IntakeConfig(min_score=1.0),
                       reproduce=always_repro)
    d = ik.submit(rec(file=None, test_id=None, occurrences=1))
    assert not d.admitted and d.gate == G_VALUE
    assert d.code == "not_actionable"


def test_out_of_scope_path_refused(store):
    ik = FailureIntake(
        store, IntakeConfig(in_scope_prefixes=("genesis/",)),
        reproduce=always_repro)
    d = ik.submit(rec(file="site-packages/other/mod.py"))
    assert not d.admitted and d.gate == G_VALUE


def test_in_scope_path_admitted(store):
    ik = FailureIntake(
        store, IntakeConfig(in_scope_prefixes=("genesis/",)),
        reproduce=always_repro)
    assert ik.submit(rec(file="genesis/rookery/mod.py")).admitted


def test_dependency_problem_refused(intake):
    d = intake.submit(rec(meta={"dependency": True}))
    assert not d.admitted and d.gate == G_VALUE


def test_queue_cap_stops_intake(store):
    ik = FailureIntake(store, IntakeConfig(max_open_tasks=2),
                       reproduce=always_repro)
    assert ik.submit(rec(message="a")).admitted
    assert ik.submit(rec(message="b")).admitted
    d = ik.submit(rec(message="c"))
    assert not d.admitted and d.code == "queue_full"


# -------------------------------------------------- G5: registration


def test_admitted_failure_becomes_a_claimable_task(intake, store):
    d = intake.submit(rec(), priority=3)
    assert d.admitted and d.task_id.startswith("intake-")
    task = store.claim("w1")
    assert task and task.id == d.task_id
    assert task.kind == "fix_failure"
    assert task.payload["file"] == "pkg/mod.py"
    assert task.payload["origin_task"] == "orig"
    assert task.payload["signature"] == d.signature


def test_every_decision_is_logged(intake, store):
    intake.submit(rec(kind="api_transient"))
    intake.submit(rec())
    kinds = [e["kind"] for e in store.events()]
    assert "intake_rejected" in kinds and "intake_admitted" in kinds


def test_rejection_summary_groups_reasons(intake):
    intake.submit(rec(kind="api_transient"))
    intake.submit(rec(kind="api_transient", message="x"))
    intake.submit(rec(kind="budget_stop", message="y"))
    summary = intake.rejection_summary()
    assert summary["api_transient"] == 2
    assert summary["budget_stop"] == 1


def test_score_rewards_repetition(intake):
    low, _ = intake.score(rec(occurrences=1))
    high, _ = intake.score(rec(occurrences=5))
    assert high > low
