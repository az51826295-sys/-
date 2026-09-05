"""Alpha step 8: service config and the long-running entrypoint.

The service is tested with a faked model - the real-API path is
covered by the smoke - so these exercise the wiring, the config
validation that gates startup, and one short serve() cycle that
recovers, processes a queued task, writes a live report and stops
cleanly.
"""

import os
import subprocess

import pytest

from genesis.rookery.engine.config import ServiceConfig
from genesis.rookery.engine.service import build_engine, serve


@pytest.fixture()
def git_repo(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    env = {**os.environ, "GIT_AUTHOR_NAME": "t",
           "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=repo,
                   check=True)
    (repo / "calc.py").write_text("def add(a, b):\n    return a - b\n",
                                  encoding="utf-8")
    (repo / "test_calc.py").write_text(
        "import calc\n\n\ndef test_add():\n"
        "    assert calc.add(2, 3) == 5\n", encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=repo, env=env,
                   check=True)
    return str(repo)


def cfg(tmp_path, repo, **kw):
    base = dict(repo=repo, data_dir=str(tmp_path / "data"),
                work_root=str(tmp_path / "data" / "work"),
                workers=1, tick_seconds=0.3)
    base.update(kw)
    return ServiceConfig(**base)


class FakeCall:
    text = "# file: calc.py\ndef add(a, b):\n    return a + b\n"


class FakeClient:
    usage = type("U", (), {"cost_usd": 0.0, "tokens_in": 0,
                           "tokens_out": 0})()

    def complete(self, *a, **k):
        return FakeCall()


# ---------------------------------------------------------- config


def test_from_env_reads_overrides():
    c = ServiceConfig.from_env({
        "ROOKERY_REPO": "/r", "ROOKERY_DATA": "/d",
        "ROOKERY_WORK": "/w", "ROOKERY_WORKERS": "4",
        "ROOKERY_STOP_KRW": "50000", "ROOKERY_PRICE_IN": "2.5"})
    assert c.repo == "/r" and c.workers == 4
    assert c.stop_krw == 50000 and c.price_in_per_mtok == 2.5
    assert c.db_path().endswith("engine.db")


def test_budget_policy_from_config():
    c = ServiceConfig(repo="/r", data_dir="/d", work_root="/w",
                      stop_krw=45000, usd_krw=1300)
    p = c.budget_policy()
    assert p.stop_krw == 45000 and p.usd_krw == 1300


def test_validate_collects_every_problem(tmp_path):
    c = ServiceConfig(repo="", data_dir="", work_root="/w",
                      price_in_per_mtok=0)
    problems = c.validate(env={}, require_api=True)
    assert any("ROOKERY_REPO" in p for p in problems)
    assert any("ANTHROPIC_API_KEY" in p for p in problems)
    assert any("GENESIS_SPEND" in p for p in problems)
    assert any("단가" in p for p in problems)


def test_validate_passes_on_good_config(git_repo, tmp_path):
    c = cfg(tmp_path, git_repo)
    assert c.validate(env={"ANTHROPIC_API_KEY": "sk-x",
                           "GENESIS_SPEND": "i-approve"}) == []


def test_validate_rejects_non_git_repo(tmp_path):
    c = cfg(tmp_path, str(tmp_path / "not_a_repo"))
    problems = c.validate(env={"ANTHROPIC_API_KEY": "x",
                               "GENESIS_SPEND": "i-approve"})
    assert any("git 저장소가 아님" in p for p in problems)


def test_validate_flags_stop_line_above_month(git_repo, tmp_path):
    c = cfg(tmp_path, git_repo, stop_krw=70000, month_total_krw=60000)
    problems = c.validate(env={"ANTHROPIC_API_KEY": "x",
                               "GENESIS_SPEND": "i-approve"})
    assert any("정지선" in p for p in problems)


# ----------------------------------------------------------- build


def test_build_engine_wires_components(git_repo, tmp_path):
    c = cfg(tmp_path, git_repo)
    store, guard, auditor, reporter, engine = build_engine(
        c, client_factory=lambda: FakeClient())
    assert engine.repo == git_repo
    assert "fix" in engine.handlers
    assert reporter.out_dir == c.reports_dir()
    store.close()


# ----------------------------------------------------------- serve


def test_serve_refuses_bad_config(tmp_path):
    c = cfg(tmp_path, str(tmp_path / "nope"))
    rc = serve(c, client_factory=lambda: FakeClient(), stop_after=0.2,
               install_signals=False)
    assert rc == -1, "startup must refuse an invalid config"


def test_serve_processes_a_queued_task(git_repo, tmp_path):
    from genesis.rookery.engine.store import Store

    c = cfg(tmp_path, git_repo)
    Store(c.db_path()).close()          # create the db dir
    store = Store(c.db_path())
    store.add_task("fix1", "fix", {
        "file": "calc.py", "test_id": "test_calc.py::test_add",
        "symbol": "add", "change_kind": "code",
        "repro_tests": ["test_calc.py::test_add"], "smoke_tests": [],
        "issue": "add wrong", "focus_symbols": ["add"]})
    store.close()

    ticks = serve(c, client_factory=lambda: FakeClient(),
                  stop_after=6.0, install_signals=False)
    assert ticks >= 1

    store = Store(c.db_path())
    assert store.get("fix1")["state"] == "succeeded"
    store.close()
    # a live report was written for an operator to tail
    today_txt = os.path.join(c.reports_dir(), "today.txt")
    assert os.path.exists(today_txt)
    assert "Rookery Alpha" in open(today_txt, encoding="utf-8").read()


def test_serve_recovers_on_start(git_repo, tmp_path):
    """A task left leased by a dead worker is requeued and then run."""
    from genesis.rookery.engine.store import Store

    c = cfg(tmp_path, git_repo)
    Store(c.db_path()).close()
    store = Store(c.db_path())
    store.add_task("fix1", "fix", {
        "file": "calc.py", "test_id": "test_calc.py::test_add",
        "symbol": "add", "change_kind": "code",
        "repro_tests": ["test_calc.py::test_add"], "smoke_tests": [],
        "issue": "add wrong", "focus_symbols": ["add"]})
    store.claim("dead-worker", lease_s=0.0)      # crash mid-flight
    store.close()

    serve(c, client_factory=lambda: FakeClient(), stop_after=6.0,
          install_signals=False)
    store = Store(c.db_path())
    assert store.get("fix1")["state"] == "succeeded"
    assert any(e["kind"] == "startup_recovery"
               for e in store.events())
    store.close()
