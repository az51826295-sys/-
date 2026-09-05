"""Alpha step 7: daily report.

Acceptance condition 8 is "zero missed reports", so the tests are
mostly about detecting and filling gaps rather than about formatting.
"""

import os
import time
from datetime import datetime, timedelta

import pytest

from genesis.rookery.engine.auditor import Auditor, ValidatorVerdict
from genesis.rookery.engine.budget import BudgetGuard, BudgetPolicy
from genesis.rookery.engine.intake import (
    FailureIntake, FailureRecord, ReproResult)
from genesis.rookery.engine.report import (
    DailyReporter, classify_failure)
from genesis.rookery.engine.store import Store


@pytest.fixture()
def rig(tmp_path):
    store = Store(str(tmp_path / "e.db"))
    guard = BudgetGuard(store, BudgetPolicy(usd_krw=1000.0))
    reporter = DailyReporter(store, guard,
                             out_dir=str(tmp_path / "reports"))
    yield store, guard, reporter
    store.close()


def today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


# ------------------------------------------------ failure classes


@pytest.mark.parametrize("text,expected", [
    ("budget_exceeded_internal: ...", "budget"),
    ("api_credit_exhausted", "api"),
    ("patch_apply_fail: x not found", "patch"),
    ("env_setup_fail", "env"),
    ("path_outside_workspace: ../x", "path_outside_workspace"),
    ("lease expired", "lease expired"),
])
def test_known_failures_classified(text, expected):
    assert classify_failure(text) == expected


def test_unknown_failure_counts_against_the_rate():
    assert classify_failure("something nobody named") == \
        "unclassified"
    assert classify_failure(None) == "unclassified"


def test_classification_rate_reported(rig):
    store, _, reporter = rig
    store.add_task("t1", "fix")
    store.fail(store.claim("w1"), "api_transient: 429", retry_in=0)
    store.add_task("t2", "fix")
    store.fail(store.claim("w1"), "weird nameless thing", retry_in=0)
    data = reporter.collect(today())
    assert data.classification_rate == pytest.approx(0.5)
    assert data.failures["unclassified"] == 1


# ------------------------------------------------------- contents


def test_report_covers_every_section(rig):
    store, guard, reporter = rig
    store.add_task("t1", "fix")
    store.complete(store.claim("w1"))
    r = guard.reserve(300.0, task_id="t1")
    guard.settle(r, usd=0.2)
    text = reporter.preview(today())
    for section in ("[작업]", "[실패 분류]", "[과제 유입]", "[안전]",
                    "[정지]", "[합격 조건]", "[예산]"):
        assert section in text, section


def test_intake_and_safety_appear(rig, tmp_path):
    store, guard, reporter = rig
    intake = FailureIntake(
        store, reproduce=lambda f: ReproResult(True, 3, 3))
    intake.submit(FailureRecord(source="api", kind="api_transient",
                                message="429"))
    intake.submit(FailureRecord(
        source="test", kind="assertion_error", message="boom",
        test_id="tests/t.py::a", file="pkg/m.py", occurrences=2))
    from genesis.rookery.engine.safety import AuditedPolicy, SafetyPolicy
    AuditedPolicy(SafetyPolicy(), store).check_command(["rm", "-rf", "/"])
    data = reporter.collect(today())
    assert data.intake["admitted"] == 1
    assert data.intake["rejected"] == 1
    assert data.intake["by_reason"]["api_transient"] == 1
    assert data.safety["blocked_commands"] == 1


def test_halt_state_surfaces(rig):
    store, guard, reporter = rig
    Auditor(store).audit(ValidatorVerdict(
        task_id="t1", accepted=True, evidence_tests=["x"],
        before={"x": "pass"}, after={"x": "pass"}))
    text = reporter.preview(today())
    assert "감사 정지 상태" in text
    data = reporter.collect(today())
    assert data.halts["auditor_halted"]
    assert data.halts["engine_halts"] >= 1


def test_acceptance_counts_reruns_of_completed_tasks(rig):
    store, _, reporter = rig
    store.add_task("t1", "fix")
    store.complete(store.claim("w1"))
    data = reporter.collect(today())
    assert data.acceptance["completed_task_reruns"] == 0


# --------------------------------------------- missing / backfill


def _yesterday() -> str:
    return (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")


def test_finalized_past_day_is_immutable(rig):
    """A finalized report for a completed day is write-once; today is
    a live preview and not frozen."""
    store, _, reporter = rig
    old = time.time() - 86400          # yesterday: a completed day
    store.conn.execute(
        "INSERT INTO events (ts, kind, data) VALUES (?, 'seed', '{}')",
        (old,))
    first = reporter.finalize(_yesterday())
    store.add_task("t2", "fix")        # later activity
    second = reporter.finalize(_yesterday())
    assert first == second, \
        "a finalized past day must not be silently rewritten"
    assert store.report_days() == [_yesterday()]


def test_today_preview_is_live(rig):
    store, _, reporter = rig
    before = reporter.preview(today())
    store.add_task("t1", "fix")
    store.complete(store.claim("w1"))
    after = reporter.preview(today())
    assert before != after, "today's preview must reflect new events"
    assert store.report_days() == [], "preview never persists"


def test_missing_days_detected(rig):
    store, _, reporter = rig
    old = time.time() - 3 * 86400
    store.conn.execute(
        "INSERT INTO events (ts, kind, data) VALUES (?, 'seed', '{}')",
        (old,))
    missing = reporter.missing_days()
    assert len(missing) == 3, missing
    assert today() not in missing, "today is not overdue yet"


def test_ensure_backfills_completed_days_only(rig):
    """Acceptance condition 8: a box that was off still owes reports
    for the days it missed - but not for today, which is still live."""
    store, _, reporter = rig
    old = time.time() - 2 * 86400
    store.conn.execute(
        "INSERT INTO events (ts, kind, data) VALUES (?, 'seed', '{}')",
        (old,))
    written = reporter.ensure()
    assert len(written) == 2          # two completed missed days
    days = store.report_days()
    assert len(days) == 2 and today() not in days
    assert "지연 생성" in store.get_report(days[0])["text"]


def test_ensure_is_idempotent(rig):
    store, _, reporter = rig
    old = time.time() - 86400
    store.conn.execute(
        "INSERT INTO events (ts, kind, data) VALUES (?, 'seed', '{}')",
        (old,))
    first = reporter.ensure()
    second = reporter.ensure()
    assert first == [_yesterday()] and second == []
    assert len(store.report_days()) == 1


def test_report_written_to_disk(rig, tmp_path):
    store, _, reporter = rig
    old = time.time() - 86400
    store.conn.execute(
        "INSERT INTO events (ts, kind, data) VALUES (?, 'seed', '{}')",
        (old,))
    reporter.ensure()
    path = tmp_path / "reports" / f"report-{_yesterday()}.txt"
    assert path.exists() and "Rookery Alpha" in path.read_text(
        encoding="utf-8")


def test_no_reports_owed_before_any_activity(rig):
    _, _, reporter = rig
    assert reporter.missing_days() == []


def test_finalized_day_survives_reboot(tmp_path):
    path = str(tmp_path / "e.db")
    s1 = Store(path)
    old = time.time() - 86400
    s1.conn.execute(
        "INSERT INTO events (ts, kind, data) VALUES (?, 'seed', '{}')",
        (old,))
    assert DailyReporter(s1).ensure() == [_yesterday()]
    s1.close()
    s2 = Store(path)                                   # reboot
    assert s2.get_report(_yesterday()) is not None
    assert DailyReporter(s2).ensure() == [], \
        "a restart must not duplicate a finalized report"
    s2.close()
