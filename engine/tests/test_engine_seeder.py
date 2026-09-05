"""Alpha: pytest-failure task seeder.

The tests cover the two location paths and, most importantly, that an
unlocalizable failure is NOT enqueued as a fix - the seeder must not
manufacture tasks the handler cannot act on.
"""

import os
import subprocess

import pytest

from genesis.rookery.engine.intake import ReproResult
from genesis.rookery.engine.seeder import (
    FailureSeeder, collect_failures, passing_tests)
from genesis.rookery.engine.store import Store


def _git_repo(tmp_path, files: dict):
    repo = tmp_path / "repo"
    repo.mkdir()
    env = {**os.environ, "GIT_AUTHOR_NAME": "t",
           "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=repo,
                   check=True)
    for name, content in files.items():
        p = repo / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=repo, env=env,
                   check=True)
    return str(repo)


# a bug where the source RAISES: the traceback carries a source frame
RAISING = {
    "mymath.py": "def reciprocal(x):\n    return 1 / x\n\n\n"
                 "def half(x):\n    return x / 2\n",
    "test_mymath.py": "import mymath\n\n\n"
                      "def test_reciprocal_zero():\n"
                      "    assert mymath.reciprocal(0) == 0\n\n\n"
                      "def test_half():\n    assert mymath.half(4) == 2\n",
}

# a pure ASSERTION failure: wrong return value, source does not raise
ASSERTION = {
    "calc.py": "def add(a, b):\n    return a - b\n\n\n"
               "def sub(a, b):\n    return a - b\n",
    "test_calc.py": "import calc\n\n\n"
                    "def test_add():\n    assert calc.add(2, 3) == 5\n\n\n"
                    "def test_sub():\n    assert calc.sub(5, 2) == 3\n",
}

# a failure with no locatable source at all
UNLOCATABLE = {
    "test_lonely.py": "def test_truth():\n    assert 1 == 2\n",
}


# --------------------------------------------------------- location


def test_collect_locates_source_via_traceback(tmp_path):
    repo = _git_repo(tmp_path, RAISING)
    failures = collect_failures(repo)
    ids = {f.test_id.split("::")[-1]: f for f in failures}
    f = ids["test_reciprocal_zero"]
    assert f.file == "mymath.py" and f.located_by == "traceback"
    assert f.symbol == "reciprocal"


def test_collect_locates_source_via_import(tmp_path):
    repo = _git_repo(tmp_path, ASSERTION)
    failures = collect_failures(repo)
    f = next(x for x in failures
             if x.test_id.endswith("test_add"))
    assert f.file == "calc.py" and f.located_by == "import"
    assert f.symbol == "add"


def test_unlocatable_failure_has_no_file(tmp_path):
    repo = _git_repo(tmp_path, UNLOCATABLE)
    failures = collect_failures(repo)
    assert len(failures) == 1 and failures[0].file is None


def test_passing_siblings_become_smoke(tmp_path):
    repo = _git_repo(tmp_path, ASSERTION)
    smoke = passing_tests(repo, "test_calc.py",
                          "test_calc.py::test_add")
    assert any(s.endswith("test_sub") for s in smoke)
    assert not any(s.endswith("test_add") for s in smoke)


# ---------------------------------------------------------- seeding


def test_seed_enqueues_located_failure_as_fix(tmp_path):
    repo = _git_repo(tmp_path, ASSERTION)
    store = Store(str(tmp_path / "e.db"))
    seeder = FailureSeeder(repo, store, repro_runs=1)
    summary = seeder.seed()
    assert summary.admitted == 1
    task = store.claim("w1")
    assert task.kind == "fix"                    # handler-dispatchable
    assert task.payload["file"] == "calc.py"
    assert task.payload["repro_tests"] == ["test_calc.py::test_add"]
    assert any(s.endswith("test_sub")
               for s in task.payload["smoke_tests"])
    assert task.payload["focus_symbols"] == ["add"]
    store.close()


def test_seed_drops_unlocatable_failure(tmp_path):
    repo = _git_repo(tmp_path, UNLOCATABLE)
    store = Store(str(tmp_path / "e.db"))
    seeder = FailureSeeder(repo, store, repro_runs=1)
    summary = seeder.seed()
    assert summary.collected == 1 and summary.unlocated == 1
    assert summary.admitted == 0
    assert store.pending_count() == 0, \
        "a failure with no file must not become a fix task"
    assert any(e["kind"] == "seed_unlocated" for e in store.events())
    store.close()


def test_seed_is_idempotent_via_signature(tmp_path):
    repo = _git_repo(tmp_path, ASSERTION)
    store = Store(str(tmp_path / "e.db"))
    seeder = FailureSeeder(repo, store, repro_runs=1)
    first = seeder.seed()
    second = seeder.seed()
    assert first.admitted == 1
    assert second.admitted == 0 and "duplicate" in second.rejected
    store.close()


def test_flaky_failure_is_not_seeded(tmp_path):
    """A test that does not fail on re-run is not a defect."""
    repo = _git_repo(tmp_path, ASSERTION)
    store = Store(str(tmp_path / "e.db"))
    seeder = FailureSeeder(repo, store)
    # force the reproduce probe to look flaky
    seeder.intake._reproduce = lambda f: ReproResult(
        reproduced=True, runs=2, failures=1, flaky=True)
    summary = seeder.seed()
    assert summary.admitted == 0
    assert "flaky" in summary.rejected
    store.close()


def test_seeded_task_is_fixable_end_to_end(tmp_path):
    """The seeded payload really drives the code-fix handler."""
    from genesis.rookery.engine.auditor import Auditor
    from genesis.rookery.engine.budget import BudgetGuard, BudgetPolicy
    from genesis.rookery.engine.handlers import code_fix_handler
    from genesis.rookery.engine.worker import Engine, HandlerSpec

    repo = _git_repo(tmp_path, ASSERTION)
    store = Store(str(tmp_path / "e.db"))
    FailureSeeder(repo, store, repro_runs=1).seed()

    class FakeCall:
        text = "# file: calc.py\ndef add(a, b):\n    return a + b\n"

    class FakeClient:
        usage = type("U", (), {"cost_usd": 0.0, "tokens_in": 0,
                               "tokens_out": 0})()

        def complete(self, *a, **k):
            return FakeCall()

    guard = BudgetGuard(store, BudgetPolicy(
        usd_krw=1000.0, fixed_monthly_krw=0.0, daily_krw=1e9,
        task_krw=1e9))
    engine = Engine(
        store, guard, Auditor(store), repo, str(tmp_path / "work"),
        handlers={"fix": HandlerSpec(code_fix_handler, external=True)},
        client_factory=lambda: FakeClient())
    engine.drain()
    tasks = [store.get(t) for t in
             [r["id"] for r in store.conn.execute(
                 "SELECT id FROM tasks").fetchall()]]
    assert any(t["state"] == "succeeded" for t in tasks), \
        [t["state"] for t in tasks]
    store.close()
