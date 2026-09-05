"""Alpha: the doc and test_add handlers, end to end through the engine.

Each kind's oracle is checked by the auditor with a DIFFERENT
invariant than the handler's own success test - a doc that changes
behavior, or a toothless characterization test, must be rejected and
halt the engine.
"""

import os
import subprocess

import pytest

from genesis.rookery.engine.auditor import Auditor, ValidatorVerdict
from genesis.rookery.engine.budget import BudgetGuard, BudgetPolicy
from genesis.rookery.engine.handlers_extra import (
    add_docstring_handler, add_test_handler)
from genesis.rookery.engine.store import Store
from genesis.rookery.engine.worker import Engine, HandlerSpec

MOD = "def area(w, h):\n    return w * h\n"
TESTS = "import mod\n\n\ndef test_area_exists():\n    assert mod.area\n"


@pytest.fixture()
def repo(tmp_path):
    path = tmp_path / "repo"
    path.mkdir()
    env = {**os.environ, "GIT_AUTHOR_NAME": "t",
           "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=path,
                   check=True)
    (path / "mod.py").write_text(MOD, encoding="utf-8")
    (path / "test_mod.py").write_text(TESTS, encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=path, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=path,
                   env=env, check=True)
    return str(path)


class Client:
    def __init__(self, text):
        self._text = text

    usage = type("U", (), {"cost_usd": 0.0, "tokens_in": 0,
                           "tokens_out": 0})()

    def complete(self, *a, **k):
        return type("R", (), {"text": self._text})()


def engine_with(tmp_path, repo, kind, handler, text):
    store = Store(str(tmp_path / "e.db"))
    guard = BudgetGuard(store, BudgetPolicy(
        usd_krw=1000.0, fixed_monthly_krw=0.0, daily_krw=1e9,
        task_krw=1e9))
    eng = Engine(
        store, guard, Auditor(store), repo, str(tmp_path / "work"),
        handlers={kind: HandlerSpec(handler, external=True)},
        client_factory=lambda: Client(text))
    return store, eng


# --------------------------------------------------------------- doc


GOOD_DOC = ('# file: mod.py\ndef area(w, h):\n'
            '    """Return the rectangle area."""\n    return w * h\n')
DOC_THAT_CHANGES = ('# file: mod.py\ndef area(w, h):\n'
                    '    """Area."""\n    return w + h\n')


def test_doc_added_and_adopted(tmp_path, repo):
    store, eng = engine_with(tmp_path, repo, "doc",
                             add_docstring_handler, GOOD_DOC)
    store.add_task("d1", "doc", {"file": "mod.py",
                                 "focus_symbols": ["area"],
                                 "change_kind": "doc"})
    eng.drain()
    assert store.get("d1")["state"] == "succeeded"
    assert not eng.auditor.halted()
    store.close()


def test_doc_that_changes_behavior_is_rejected(tmp_path, repo):
    """The handler's own oracle (AST minus docstring must match)
    catches a behavior change; that is an honest task failure, not an
    auditor halt - the same as code_fix rejecting a wrong patch."""
    store, eng = engine_with(tmp_path, repo, "doc",
                             add_docstring_handler, DOC_THAT_CHANGES)
    store.add_task("d1", "doc", {"file": "mod.py",
                                 "focus_symbols": ["area"]},
                   max_attempts=1)
    eng.drain()
    assert store.get("d1")["state"] == "failed"
    assert not eng.auditor.halted(), \
        "an honest handler rejection must not halt the engine"
    # the human checkout is untouched
    assert "return w * h" in open(os.path.join(repo, "mod.py"),
                                  encoding="utf-8").read()
    store.close()


def test_doc_behavior_check_is_ast_not_text(tmp_path, repo):
    """Reformatting whitespace but keeping behavior is still fine;
    changing the return is not - the check is structural."""
    reflowed = ('# file: mod.py\ndef area(w, h):\n'
                '    """A."""\n    return w*h\n')   # same AST, diff text
    store, eng = engine_with(tmp_path, repo, "doc",
                             add_docstring_handler, reflowed)
    store.add_task("d1", "doc", {"file": "mod.py",
                                 "focus_symbols": ["area"]})
    eng.drain()
    assert store.get("d1")["state"] == "succeeded"
    store.close()


# ----------------------------------------------------------- test_add


GOOD_TEST = ("def test_area_char():\n"
             "    assert mod.area(3, 4) == 12\n")
TOOTHLESS_TEST = ("def test_area_weak():\n"
                  "    assert mod.area is not None\n")


def test_characterization_test_added_and_adopted(tmp_path, repo):
    store, eng = engine_with(tmp_path, repo, "test_add",
                             add_test_handler, GOOD_TEST)
    store.add_task("t1", "test_add", {
        "file": "mod.py", "focus_symbols": ["area"],
        "test_file": "test_mod.py", "module": "mod",
        "change_kind": "test"})
    eng.drain()
    row = store.get("t1")
    assert row["state"] == "succeeded", row["last_error"]
    assert not eng.auditor.halted()
    store.close()


def test_toothless_test_is_rejected(tmp_path, repo):
    """A test that passes even when the target is broken has no teeth
    (the §9 discriminating-power check). The handler's mutation probe
    catches it and fails the task honestly, without halting."""
    store, eng = engine_with(tmp_path, repo, "test_add",
                             add_test_handler, TOOTHLESS_TEST)
    store.add_task("t1", "test_add", {
        "file": "mod.py", "focus_symbols": ["area"],
        "test_file": "test_mod.py", "module": "mod"},
        max_attempts=1)
    eng.drain()
    assert store.get("t1")["state"] == "failed"
    assert not eng.auditor.halted()
    # the toothless test was not left in the checkout
    assert "test_area_weak" not in open(
        os.path.join(repo, "test_mod.py"), encoding="utf-8").read()
    store.close()


# ---------------------------------------------------- auditor direct


def test_auditor_rejects_doc_touching_tests():
    v = ValidatorVerdict("x", True, kind="doc",
                         changed_files=["test_mod.py"],
                         checks={"behavior_preserved": True,
                                 "docstring_added": True})
    a = Auditor(None)
    r = a.audit(v)
    assert not r.agree


def test_auditor_rejects_testadd_touching_source():
    v = ValidatorVerdict("x", True, kind="test_add",
                         changed_files=["mod.py"],
                         checks={"new_test_passes": True,
                                 "catches_mutation": True})
    r = Auditor(None).audit(v)
    assert not r.agree


def test_auditor_unknown_kind_halts():
    r = Auditor(None).audit(ValidatorVerdict("x", True, kind="weird"))
    assert not r.agree
