"""Alpha: push-only PR preparation (human opens the PR).

The engine pushes a rookery/* branch and records a review-ready
manifest; it never creates or merges the PR. These tests cover the
URL derivation, a real push to a bare remote, the graceful no-remote
and blocked cases, and that a push failure does not fail the task.
"""

import os
import subprocess

import pytest

from genesis.rookery.engine.auditor import Auditor
from genesis.rookery.engine.budget import BudgetGuard, BudgetPolicy
from genesis.rookery.engine.isolation import Workspace
from genesis.rookery.engine.pr import (
    PrPreparer, compare_url, pr_body)
from genesis.rookery.engine.store import Store


# ------------------------------------------------------- compare url


@pytest.mark.parametrize("url,expected", [
    ("git@github.com:me/repo.git",
     "https://github.com/me/repo/compare/main...rookery/t1?expand=1"),
    ("https://github.com/me/repo.git",
     "https://github.com/me/repo/compare/main...rookery/t1?expand=1"),
    ("https://github.com/me/repo",
     "https://github.com/me/repo/compare/main...rookery/t1?expand=1"),
])
def test_compare_url_github(url, expected):
    assert compare_url(url, "main", "rookery/t1") == expected


@pytest.mark.parametrize("url", [
    None, "", "https://gitlab.com/me/repo.git",
    "/local/path/repo",
])
def test_compare_url_unknown_host_is_none(url):
    assert compare_url(url, "main", "rookery/t1") is None


# ------------------------------------------------------- fixtures


def _commit_all(path, msg, env):
    subprocess.run(["git", "add", "-A"], cwd=path, check=True)
    subprocess.run(["git", "commit", "-qm", msg], cwd=path, env=env,
                   check=True)


@pytest.fixture()
def repo_with_remote(tmp_path):
    env = {**os.environ, "GIT_AUTHOR_NAME": "t",
           "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    bare = tmp_path / "remote.git"
    subprocess.run(["git", "init", "--bare", "-q", str(bare)],
                   check=True)
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=repo,
                   check=True)
    (repo / "calc.py").write_text("x = 1\n", encoding="utf-8")
    _commit_all(repo, "init", env)
    subprocess.run(["git", "remote", "add", "origin", str(bare)],
                   cwd=repo, check=True)
    subprocess.run(["git", "push", "-q", "origin", "main"], cwd=repo,
                   env=env, check=True)
    return str(repo), str(bare)


@pytest.fixture()
def repo_no_remote(tmp_path):
    env = {**os.environ, "GIT_AUTHOR_NAME": "t",
           "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=repo,
                   check=True)
    (repo / "calc.py").write_text("x = 1\n", encoding="utf-8")
    _commit_all(repo, "init", env)
    return str(repo)


def _changed_workspace(repo, tmp_path, name="t1"):
    ws = Workspace(repo, name, str(tmp_path / "work")).create()
    ws.write_text("calc.py", "x = 2\n")
    ws.commit("rookery: fix t1")
    return ws


# ------------------------------------------------------- prepare


def test_prepare_pushes_branch_to_remote(repo_with_remote, tmp_path):
    repo, bare = repo_with_remote
    store = Store(str(tmp_path / "e.db"))
    ws = _changed_workspace(repo, tmp_path)
    prep = PrPreparer(store, base="main")
    req = prep.prepare(ws, "t1", "fix t1", "body")
    assert req.pushed and req.branch == "rookery/t1"
    assert req.compare_url is None or "compare" in req.compare_url
    # the branch really landed on the remote
    r = subprocess.run(["git", "branch", "--list", "rookery/t1"],
                       cwd=bare, capture_output=True, text=True)
    assert "rookery/t1" in r.stdout
    assert any(e["kind"] == "pr_ready" for e in store.events())
    ws.destroy(delete_branch=False)
    store.close()


def test_prepare_without_remote_preserves_branch(repo_no_remote,
                                                 tmp_path):
    store = Store(str(tmp_path / "e.db"))
    ws = _changed_workspace(repo_no_remote, tmp_path)
    req = PrPreparer(store).prepare(ws, "t1", "fix", "body")
    assert not req.pushed and "원격 없음" in req.reason
    # branch is kept locally so a human can push it by hand
    r = subprocess.run(["git", "branch", "--list", "rookery/t1"],
                       cwd=repo_no_remote, capture_output=True,
                       text=True)
    assert "rookery/t1" in r.stdout
    ws.destroy(delete_branch=False)
    store.close()


def test_prepare_records_manifest_for_review(repo_with_remote,
                                             tmp_path):
    repo, _ = repo_with_remote
    store = Store(str(tmp_path / "e.db"))
    ws = _changed_workspace(repo, tmp_path)
    prep = PrPreparer(store)
    prep.prepare(ws, "t1", "fix t1", "body text")
    pending = prep.pending()
    assert len(pending) == 1
    assert pending[0]["branch"] == "rookery/t1"
    assert pending[0]["title"] == "fix t1"
    ws.destroy(delete_branch=False)
    store.close()


def test_engine_pushes_and_lists_in_report(repo_with_remote, tmp_path):
    """The full path: a fixed bug is pushed and shows up as a review
    item in the daily report, never auto-merged."""
    from genesis.rookery.engine.handlers import code_fix_handler
    from genesis.rookery.engine.report import DailyReporter
    from genesis.rookery.engine.worker import Engine, HandlerSpec

    repo, bare = repo_with_remote
    env = {**os.environ, "GIT_AUTHOR_NAME": "t",
           "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    # give the repo a real bug + test
    subprocess.run(["git", "checkout", "-q", "main"], cwd=repo)
    with open(os.path.join(repo, "calc.py"), "w", encoding="utf-8") as f:
        f.write("def add(a, b):\n    return a - b\n")
    with open(os.path.join(repo, "test_calc.py"), "w",
              encoding="utf-8") as f:
        f.write("import calc\n\n\ndef test_add():\n"
                "    assert calc.add(2, 3) == 5\n")
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-qm", "bug"], cwd=repo, env=env,
                   check=True)

    class FakeCall:
        text = "# file: calc.py\ndef add(a, b):\n    return a + b\n"

    class FakeClient:
        usage = type("U", (), {"cost_usd": 0.001, "tokens_in": 10,
                               "tokens_out": 5})()

        def complete(self, *a, **k):
            return FakeCall()

    store = Store(str(tmp_path / "e.db"))
    guard = BudgetGuard(store, BudgetPolicy(
        usd_krw=1000.0, fixed_monthly_krw=0.0, daily_krw=1e9,
        task_krw=1e9))
    reporter = DailyReporter(store, guard)
    engine = Engine(
        store, guard, Auditor(store), repo, str(tmp_path / "work"),
        handlers={"fix": HandlerSpec(code_fix_handler, external=True)},
        client_factory=lambda: FakeClient(), reporter=reporter,
        base_branch="main")
    store.add_task("t1", "fix", {
        "file": "calc.py", "repro_tests": ["test_calc.py::test_add"],
        "smoke_tests": [], "issue": "add wrong",
        "focus_symbols": ["add"]})
    engine.drain()
    assert store.get("t1")["state"] == "succeeded"
    # pushed to the bare remote, not merged into main
    r = subprocess.run(["git", "branch", "--list", "rookery/t1"],
                       cwd=bare, capture_output=True, text=True)
    assert "rookery/t1" in r.stdout
    main_calc = subprocess.run(
        ["git", "show", "main:calc.py"], cwd=bare,
        capture_output=True, text=True).stdout
    assert "return a + b" not in main_calc, \
        "the fix must not reach main - no auto-merge"
    # the live report surfaces the review item (today is a preview,
    # not a frozen snapshot from before the work ran)
    text = reporter.preview()
    assert "검토 대기 브랜치" in text and "rookery/t1" in text
    store.close()


# ------------------------------------------------------- pr body


def test_pr_body_includes_evidence():
    from genesis.rookery.engine.auditor import ValidatorVerdict

    v = ValidatorVerdict(
        task_id="t1", accepted=True,
        evidence_tests=["tests/t.py::a"],
        before={"tests/t.py::a": "fail"},
        after={"tests/t.py::a": "pass"})
    body = pr_body("t1", {"changed_files": ["pkg/m.py"]}, v)
    assert "pkg/m.py" in body
    assert "fail → pass" in body
    assert "자동 병합하지 않습니다" in body
