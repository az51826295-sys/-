"""Alpha: queue, scheduler and worker loop.

The tests are mostly about the gates firing in the right order and
about the crash path being the same path as a lease expiring.
"""

import os
import subprocess
import threading

import pytest

from genesis.rookery.engine.auditor import Auditor, ValidatorVerdict
from genesis.rookery.engine.budget import BudgetGuard, BudgetPolicy
from genesis.rookery.engine.store import Store
from genesis.rookery.engine.worker import (
    Engine, HandlerOutcome, HandlerSpec, TaskContext)


@pytest.fixture()
def repo(tmp_path):
    path = tmp_path / "repo"
    path.mkdir()
    env = {**os.environ, "GIT_AUTHOR_NAME": "t",
           "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q"], cwd=path, check=True)
    (path / "mod.py").write_text("x = 1\n", encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=path, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=path,
                   env=env, check=True)
    return str(path)


def good_verdict(task_id: str) -> ValidatorVerdict:
    return ValidatorVerdict(
        task_id=task_id, accepted=True,
        evidence_tests=["tests/t.py::a"],
        before={"tests/t.py::a": "fail"},
        after={"tests/t.py::a": "pass"},
        reference={"tests/t.py::a": "pass"},
        changed_files=["mod.py"], metrics={"pass_rate": 0.6},
        baseline_metrics={"pass_rate": 0.5})


def fixing_handler(ctx: TaskContext) -> HandlerOutcome:
    ctx.heartbeat()
    ctx.workspace.write_text("mod.py", "x = 2\n")
    return HandlerOutcome(verdict=good_verdict(ctx.task.id),
                          result={"note": "fixed"})


def rejecting_handler(ctx: TaskContext) -> HandlerOutcome:
    ctx.workspace.write_text("mod.py", "x = 3\n")
    v = good_verdict(ctx.task.id)
    v.accepted = False
    return HandlerOutcome(verdict=v)


def leaky_handler(ctx: TaskContext) -> HandlerOutcome:
    """Passes its tests by editing the tests - the auditor must
    catch this even though the validator accepted."""
    v = good_verdict(ctx.task.id)
    v.changed_files = ["tests/test_mod.py"]
    return HandlerOutcome(verdict=v)


def escaping_handler(ctx: TaskContext) -> HandlerOutcome:
    ctx.workspace.write_text("../outside.py", "boom")
    return HandlerOutcome(verdict=good_verdict(ctx.task.id))


def build(tmp_path, repo, handlers, workers=1, **policy_kw):
    store = Store(str(tmp_path / "e.db"))
    kw = dict(usd_krw=1000.0, fixed_monthly_krw=0.0, daily_krw=1e9,
              task_krw=1e9)
    kw.update(policy_kw)
    guard = BudgetGuard(store, BudgetPolicy(**kw))
    engine = Engine(store, guard, Auditor(store), repo,
                    str(tmp_path / "work"), handlers=handlers,
                    workers=workers)
    return store, guard, engine


# ------------------------------------------------------- happy path


def test_task_is_processed_and_adopted(tmp_path, repo):
    store, _, engine = build(
        tmp_path, repo, {"fix": HandlerSpec(fixing_handler)})
    store.add_task("t1", "fix", {"test_id": "tests/t.py::a",
                                 "file": "mod.py"})
    assert engine.drain() == 1
    row = store.get("t1")
    assert row["state"] == "succeeded"
    import json
    assert json.loads(row["result"])["adopted"] is True
    store.close()


def test_rejected_candidate_fails_and_resets(tmp_path, repo):
    store, _, engine = build(
        tmp_path, repo, {"fix": HandlerSpec(rejecting_handler)})
    store.add_task("t1", "fix", max_attempts=1)
    engine.drain()
    assert store.get("t1")["state"] == "failed"
    assert "validator rejected" in store.get("t1")["last_error"]
    # the human checkout never saw the change
    assert "x = 1" in open(os.path.join(repo, "mod.py"),
                           encoding="utf-8").read()
    store.close()


def test_auditor_blocks_adoption_and_halts(tmp_path, repo):
    store, _, engine = build(
        tmp_path, repo, {"fix": HandlerSpec(leaky_handler)})
    store.add_task("t1", "fix", max_attempts=1)
    engine.drain()
    assert store.get("t1")["state"] == "failed"
    assert "auditor disagreement" in store.get("t1")["last_error"]
    assert engine.auditor.halted()
    store.close()


def test_halt_stops_all_further_work(tmp_path, repo):
    store, _, engine = build(
        tmp_path, repo, {"fix": HandlerSpec(leaky_handler)})
    store.add_task("t1", "fix", max_attempts=1)
    store.add_task("t2", "fix", max_attempts=1)
    engine.drain()
    assert store.get("t2")["state"] == "pending", \
        "no work may start while the auditor has stopped the engine"
    ok, why = engine.can_work()
    assert not ok and "halt" in why
    store.close()


def test_workspace_escape_is_contained(tmp_path, repo):
    store, _, engine = build(
        tmp_path, repo, {"fix": HandlerSpec(escaping_handler)})
    store.add_task("t1", "fix", max_attempts=1)
    engine.drain()
    assert store.get("t1")["state"] == "failed"
    assert "path_outside_workspace" in store.get("t1")["last_error"]
    assert not os.path.exists(str(tmp_path / "work" / "outside.py"))
    store.close()


# ------------------------------------------------------ budget gate


def test_budget_stop_blocks_external_but_runs_local(tmp_path, repo):
    calls = []

    def local_handler(ctx):
        calls.append(ctx.task.id)
        return HandlerOutcome(verdict=good_verdict(ctx.task.id))

    store, guard, engine = build(
        tmp_path, repo,
        {"fix": HandlerSpec(fixing_handler, external=True),
         "tidy": HandlerSpec(local_handler, external=False)},
        fixed_monthly_krw=15_000.0)
    r = guard.reserve(30_000.0, task_id="seed")
    guard.settle(r, usd=30.0)
    guard.reserve(1.0, task_id="seed")          # clear overage flag
    store.add_task("ext", "fix")
    store.add_task("loc", "tidy")
    engine.drain()
    assert store.get("ext")["state"] == "pending", "external blocked"
    assert store.get("loc")["state"] == "succeeded", "local runs"
    assert calls == ["loc"]
    store.close()


def test_high_risk_deferred_under_restriction(tmp_path, repo):
    store, guard, engine = build(
        tmp_path, repo, {"fix": HandlerSpec(fixing_handler)},
        fixed_monthly_krw=15_000.0)
    r = guard.reserve(25_000.0, task_id="seed")
    guard.settle(r, usd=25.0)
    guard.reserve(1.0, task_id="seed")
    store.add_task("t1", "fix", {"files_in_scope": 4})
    engine.drain()
    row = store.get("t1")
    assert row["state"] == "pending" and row["not_before"] > 0
    assert any(e["kind"] == "task_deferred" for e in store.events())
    store.close()


# --------------------------------------------------- recovery, loop


def test_startup_recovery_requeues_and_cleans(tmp_path, repo):
    store, guard, engine = build(
        tmp_path, repo, {"fix": HandlerSpec(fixing_handler)})
    store.add_task("t1", "fix")
    store.claim("dead-worker", lease_s=0.0)     # worker then dies
    guard.policy.reservation_ttl_s = 0.0
    guard.reserve(100.0, task_id="t1", worker="dead-worker")
    from genesis.rookery.engine.isolation import Workspace
    Workspace(repo, "ghost", str(tmp_path / "work")).create()

    info = engine.startup_recovery()
    assert info["requeued"] == ["t1"]
    assert info["reservations"] == 1
    assert "ghost" in info["workspaces"]
    assert store.get("t1")["state"] == "pending"
    store.close()


def test_unknown_kind_is_failed_not_lost(tmp_path, repo):
    store, _, engine = build(tmp_path, repo, {})
    store.add_task("t1", "mystery")
    assert engine.drain() == 1
    assert store.get("t1")["state"] == "pending"   # retried later
    assert "no handler" in store.get("t1")["last_error"]
    store.close()


def test_handler_exception_does_not_kill_the_worker(tmp_path, repo):
    def boom(ctx):
        raise RuntimeError("handler blew up")

    store, _, engine = build(
        tmp_path, repo, {"fix": HandlerSpec(boom)}, )
    store.add_task("t1", "fix", max_attempts=1)
    store.add_task("t2", "fix", max_attempts=1)
    assert engine.drain() == 2, "the loop keeps going"
    assert store.get("t1")["state"] == "failed"
    assert "worker_exception" in store.get("t1")["last_error"]
    store.close()


def test_bounded_concurrency_no_double_claim(tmp_path, repo):
    seen: list[str] = []
    lock = threading.Lock()

    def slow(ctx):
        with lock:
            seen.append(ctx.task.id)
        return HandlerOutcome(verdict=good_verdict(ctx.task.id))

    store, _, engine = build(
        tmp_path, repo, {"fix": HandlerSpec(slow)}, workers=4)
    for i in range(12):
        store.add_task(f"t{i}", "fix")
    engine.run(max_tasks_each=12, exit_when_idle=True)
    assert len(seen) == 12 and len(set(seen)) == 12
    assert store.counts().get("succeeded") == 12
    store.close()


def test_engine_resumes_after_restart(tmp_path, repo):
    """Condition 11 end to end: kill mid-flight, restart, finish."""
    path = str(tmp_path / "e.db")
    s1 = Store(path)
    s1.add_task("t1", "fix", {"file": "mod.py"})
    s1.claim("doomed", lease_s=0.0)             # simulates the crash
    s1.close()

    store, _, engine = build(tmp_path, repo,
                             {"fix": HandlerSpec(fixing_handler)})
    store.close()
    store = Store(path)
    guard = BudgetGuard(store, BudgetPolicy(usd_krw=1000.0,
                                            fixed_monthly_krw=0.0))
    engine = Engine(store, guard, Auditor(store), repo,
                    str(tmp_path / "work"),
                    handlers={"fix": HandlerSpec(fixing_handler)})
    assert engine.drain() >= 1
    assert store.get("t1")["state"] == "succeeded"
    store.close()
