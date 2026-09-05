"""Alpha: the first real handler, end to end through the engine.

A buggy function, a failing test, a model reply, and the whole
pipeline - isolate, patch, run pytest, validate, audit, adopt or roll
back. The model is faked so the pipeline is exercised without spend;
the real client drops in unchanged because it exposes the same
complete()/usage surface.
"""

import json
import os
import subprocess

import pytest

from genesis.rookery.engine.auditor import Auditor
from genesis.rookery.engine.budget import BudgetGuard, BudgetPolicy
from genesis.rookery.engine.handlers import (
    apply_blocks, parse_patch, code_fix_handler)
from genesis.rookery.engine.store import Store
from genesis.rookery.engine.worker import Engine, HandlerSpec

CALC = "def add(a, b):\n    return a - b\n\n\ndef sub(a, b):\n" \
       "    return a - b\n"
TEST = ("import calc\n\n\n"
        "def test_add():\n    assert calc.add(2, 3) == 5\n\n\n"
        "def test_sub():\n    assert calc.sub(5, 2) == 3\n")

GOOD_PATCH = "# file: calc.py\ndef add(a, b):\n    return a + b\n"
WRONG_PATCH = "# file: calc.py\ndef add(a, b):\n    return a * b\n"
TESTFILE_PATCH = ("# file: test_calc.py\n"
                  "def test_add():\n    assert True\n")


@pytest.fixture()
def repo(tmp_path):
    path = tmp_path / "repo"
    path.mkdir()
    env = {**os.environ, "GIT_AUTHOR_NAME": "t",
           "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q"], cwd=path, check=True)
    (path / "calc.py").write_text(CALC, encoding="utf-8")
    (path / "test_calc.py").write_text(TEST, encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=path, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=path,
                   env=env, check=True)
    return str(path)


class FakeCall:
    def __init__(self, text):
        self.text = text


class FakeUsage:
    cost_usd = 0.001
    tokens_in = 100
    tokens_out = 50


class FakeClient:
    """Returns each scripted reply in turn; repeats the last."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.usage = FakeUsage()
        self.calls = 0

    def complete(self, prompt, temperature=1.0, task_id=None,
                 run_id=None, worker=None):
        self.calls += 1
        idx = min(self.calls - 1, len(self.replies) - 1)
        return FakeCall(self.replies[idx])


def build(tmp_path, repo, replies):
    store = Store(str(tmp_path / "e.db"))
    guard = BudgetGuard(store, BudgetPolicy(
        usd_krw=1000.0, fixed_monthly_krw=0.0, daily_krw=1e9,
        task_krw=1e9))
    client = FakeClient(replies)
    engine = Engine(
        store, guard, Auditor(store), repo, str(tmp_path / "work"),
        handlers={"fix": HandlerSpec(code_fix_handler, external=True)},
        client_factory=lambda: client)
    return store, engine, client


def payload(**kw):
    base = dict(file="calc.py", repro_tests=["test_calc.py::test_add"],
                smoke_tests=["test_calc.py::test_sub"],
                issue="add(2,3)가 5가 아니라 -1을 반환한다",
                focus_symbols=["add"])
    base.update(kw)
    return base


# ------------------------------------------------------------ parsing


def test_parse_patch_reads_block():
    blocks = parse_patch(GOOD_PATCH)
    assert len(blocks) == 1
    assert blocks[0].file == "calc.py" and blocks[0].name == "add"


def test_parse_patch_ignores_prose():
    text = "여기 수정입니다:\n\n" + GOOD_PATCH + "\n됐습니다."
    blocks = parse_patch(text)
    assert len(blocks) == 1 and blocks[0].name == "add"


def test_parse_method_block():
    blocks = parse_patch(
        "# file: m.py\n# class: C\ndef meth(self):\n    return 1\n")
    assert blocks[0].cls == "C" and blocks[0].name == "meth"


def test_prompt_includes_repro_test_source(tmp_path, repo):
    """The live run showed a thin issue makes the model guess the
    wrong operation; the failing test's body must be in the prompt so
    intent is visible."""
    from genesis.rookery.engine.handlers import build_prompt
    from genesis.rookery.engine.isolation import Workspace

    ws = Workspace(repo, "p1", str(tmp_path / "work")).create()
    prompt = build_prompt(ws, payload(), None)
    assert "통과해야 하는 테스트" in prompt
    assert "assert calc.add(2, 3) == 5" in prompt
    ws.destroy()


# ------------------------------------------------------- end to end


def test_bug_is_fixed_and_adopted(tmp_path, repo):
    store, engine, client = build(tmp_path, repo, [GOOD_PATCH])
    store.add_task("t1", "fix", payload())
    assert engine.drain() == 1
    row = store.get("t1")
    assert row["state"] == "succeeded", row["last_error"]
    result = json.loads(row["result"])
    assert result["adopted"] and result["changed_files"] == ["calc.py"]
    # the human checkout is untouched; the fix lives on the branch
    assert "return a - b" in open(os.path.join(repo, "calc.py"),
                                  encoding="utf-8").read()
    store.close()


def test_wrong_fix_is_not_adopted(tmp_path, repo):
    store, engine, client = build(tmp_path, repo, [WRONG_PATCH])
    store.add_task("t1", "fix", payload(), max_attempts=1)
    engine.drain()
    row = store.get("t1")
    assert row["state"] == "failed"
    assert not engine.auditor.halted(), \
        "an honest wrong answer must fail the task, not halt the engine"
    store.close()


def test_patch_targeting_test_file_refused(tmp_path, repo):
    store, engine, client = build(tmp_path, repo, [TESTFILE_PATCH])
    store.add_task("t1", "fix", payload(), max_attempts=1)
    engine.drain()
    assert store.get("t1")["state"] == "failed"
    # the model could not make the test pass by editing the test
    assert "return a - b" in open(os.path.join(repo, "calc.py"),
                                  encoding="utf-8").read()
    store.close()


def test_second_candidate_succeeds(tmp_path, repo):
    """medium risk -> 2 candidates; first wrong, second right."""
    store, engine, client = build(
        tmp_path, repo, [WRONG_PATCH, GOOD_PATCH])
    store.add_task("t1", "fix",
                   payload(file="calc.py", change_kind="code"))
    engine.drain()
    row = store.get("t1")
    assert row["state"] == "succeeded", row["last_error"]
    assert client.calls == 2
    store.close()


def test_before_state_is_captured(tmp_path, repo):
    """The verdict's evidence must show fail -> pass, not an assertion."""
    from genesis.rookery.engine.isolation import Workspace
    from genesis.rookery.engine.worker import TaskContext
    from genesis.rookery.engine.risk import RiskSignals, plan_candidates

    store, engine, client = build(tmp_path, repo, [GOOD_PATCH])
    store.add_task("t1", "fix", payload())
    task = store.claim("w1")
    ws = Workspace(repo, "t1", str(tmp_path / "work2"),
                   policy=engine.policy).create()
    ctx = TaskContext(
        task=task, workspace=ws,
        plan=plan_candidates(RiskSignals.from_payload(task.payload),
                             engine.guard),
        store=store, guard=engine.guard, client=client)
    outcome = code_fix_handler(ctx)
    v = outcome.verdict
    assert v.before["test_calc.py::test_add"] == "fail"
    assert v.after["test_calc.py::test_add"] == "pass"
    assert v.accepted and "calc.py" in v.changed_files
    ws.destroy()
    store.close()


def test_no_parseable_patch_fails_cleanly(tmp_path, repo):
    store, engine, client = build(
        tmp_path, repo, ["죄송합니다, 어떻게 고칠지 모르겠습니다."])
    store.add_task("t1", "fix", payload(), max_attempts=1)
    engine.drain()
    row = store.get("t1")
    assert row["state"] == "failed"
    assert not engine.auditor.halted()
    store.close()


def test_apply_blocks_refuses_escape(tmp_path, repo):
    from genesis.rookery.engine.isolation import Workspace

    ws = Workspace(repo, "esc", str(tmp_path / "work")).create()
    blocks = parse_patch("# file: ../evil.py\ndef x():\n    return 1\n")
    err = apply_blocks(ws, blocks)
    assert err and err.startswith("path_outside_workspace")
    ws.destroy()
