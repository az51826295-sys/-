"""Alpha: the data conversion handler, end to end through the engine.

The oracle is conservation: same record count, preserved columns
verbatim, schema conformance, mined spot checks. A conversion that
drops a row, corrupts a preserved value, or emits a nonconforming
record must be rejected honestly (task failure, no halt) and leave
the human checkout untouched.
"""

import os
import subprocess

import pytest

from genesis.rookery.engine.auditor import Auditor, ValidatorVerdict
from genesis.rookery.engine.budget import BudgetGuard, BudgetPolicy
from genesis.rookery.engine.handlers_extra import (
    _parse_records, data_convert_handler)
from genesis.rookery.engine.store import Store
from genesis.rookery.engine.worker import Engine, HandlerSpec

CSV = ("id,name,joined\n"
       "1,Kim,2026/8/6\n"
       "2,Lee,Aug 3 2026\n")

SCHEMA = {"id": "int", "name": "str",
          "joined": {"type": "str",
                     "pattern": r"\d{4}-\d{2}-\d{2}"}}


@pytest.fixture()
def repo(tmp_path):
    path = tmp_path / "repo"
    path.mkdir()
    env = {**os.environ, "GIT_AUTHOR_NAME": "t",
           "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=path,
                   check=True)
    (path / "data.csv").write_text(CSV, encoding="utf-8")
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


def engine_with(tmp_path, repo, text):
    store = Store(str(tmp_path / "e.db"))
    guard = BudgetGuard(store, BudgetPolicy(
        usd_krw=1000.0, fixed_monthly_krw=0.0, daily_krw=1e9,
        task_krw=1e9))
    eng = Engine(
        store, guard, Auditor(store), repo, str(tmp_path / "work"),
        handlers={"data": HandlerSpec(data_convert_handler,
                                      external=True)},
        client_factory=lambda: Client(text))
    return store, eng


def payload(**over):
    base = {"source_file": "data.csv", "target_file": "data.json",
            "target_format": "json", "schema": SCHEMA,
            "preserve": ["id", "name"],
            "spot_checks": [{"row": 0, "field": "joined",
                             "expect": "2026-08-06"}],
            "spec": "joined를 ISO 날짜(YYYY-MM-DD)로 정규화",
            "change_kind": "data"}
    base.update(over)
    return base


GOOD = ('```json\n[\n'
        ' {"id": 1, "name": "Kim", "joined": "2026-08-06"},\n'
        ' {"id": 2, "name": "Lee", "joined": "2026-08-03"}\n'
        ']\n```')
DROPPED_ROW = ('[{"id": 1, "name": "Kim", "joined": "2026-08-06"}]')
CORRUPT_NAME = ('[{"id": 1, "name": "KIM", "joined": "2026-08-06"},\n'
                ' {"id": 2, "name": "Lee", "joined": "2026-08-03"}]')
BAD_PATTERN = ('[{"id": 1, "name": "Kim", "joined": "08/06/2026"},\n'
               ' {"id": 2, "name": "Lee", "joined": "2026-08-03"}]')
WRONG_SPOT = ('[{"id": 1, "name": "Kim", "joined": "2026-08-05"},\n'
              ' {"id": 2, "name": "Lee", "joined": "2026-08-03"}]')


def test_good_conversion_adopted(tmp_path, repo):
    store, eng = engine_with(tmp_path, repo, GOOD)
    store.add_task("c1", "data", payload())
    eng.drain()
    row = store.get("c1")
    assert row["state"] == "succeeded", row["last_error"]
    assert not eng.auditor.halted()
    store.close()


@pytest.mark.parametrize("text,label", [
    (DROPPED_ROW, "dropped row"),
    (CORRUPT_NAME, "corrupted preserved column"),
    (BAD_PATTERN, "schema pattern violation"),
    (WRONG_SPOT, "spot check miss"),
    ("이건 데이터가 아님", "unparseable output"),
])
def test_bad_conversion_rejected_without_halt(tmp_path, repo, text,
                                              label):
    store, eng = engine_with(tmp_path, repo, text)
    store.add_task("c1", "data", payload(), max_attempts=1)
    eng.drain()
    assert store.get("c1")["state"] == "failed", label
    assert not eng.auditor.halted(), \
        f"{label}: honest rejection must not halt"
    # nothing leaked into the human checkout
    assert not os.path.exists(os.path.join(repo, "data.json")), label
    store.close()


def test_missing_schema_is_invalid_task(tmp_path, repo):
    store, eng = engine_with(tmp_path, repo, GOOD)
    store.add_task("c1", "data", payload(schema=None),
                   max_attempts=1)
    eng.drain()
    assert store.get("c1")["state"] == "failed"
    assert not eng.auditor.halted()
    store.close()


def test_csv_target_roundtrip(tmp_path, repo):
    """json -> csv direction through the same oracle."""
    src = ('[{"id": 1, "name": "Kim"}, {"id": 2, "name": "Lee"}]')
    with open(os.path.join(repo, "data2.json"), "w",
              encoding="utf-8") as f:
        f.write(src)
    env = {**os.environ, "GIT_AUTHOR_NAME": "t",
           "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-qm", "more"], cwd=repo,
                   env=env, check=True)
    store, eng = engine_with(tmp_path, repo,
                             "id,name\n1,Kim\n2,Lee\n")
    store.add_task("c2", "data", payload(
        source_file="data2.json", target_file="data2.csv",
        target_format="csv", schema={"id": "int", "name": "str"},
        preserve=["id", "name"], spot_checks=[]))
    eng.drain()
    row = store.get("c2")
    assert row["state"] == "succeeded", row["last_error"]
    store.close()


# ------------------------------------------------------ parsing edges


def test_parse_records_rejects_ragged_csv():
    assert _parse_records("a,b\n1\n", "csv") is None       # missing cell
    assert _parse_records("a,b\n1,2,3\n", "csv") is None   # extra cell


def test_parse_records_rejects_non_record_json():
    assert _parse_records('{"a": 1}', "json") is None
    assert _parse_records('[1, 2]', "json") is None
    assert _parse_records("", "json") is None


# ---------------------------------------------------- auditor direct


def _ok_checks():
    return {"count_match": True, "schema_ok": True,
            "preserved_ok": True, "spot_ok": True}


def test_auditor_accepts_clean_data_verdict():
    v = ValidatorVerdict("x", True, kind="data",
                         changed_files=["out.json"],
                         checks=_ok_checks())
    assert Auditor(None).audit(v).agree


def test_auditor_rejects_data_touching_tests():
    v = ValidatorVerdict("x", True, kind="data",
                         changed_files=["test_out.py"],
                         checks=_ok_checks())
    assert not Auditor(None).audit(v).agree


def test_auditor_rejects_multi_file_write():
    v = ValidatorVerdict("x", True, kind="data",
                         changed_files=["a.json", "b.json"],
                         checks=_ok_checks())
    assert not Auditor(None).audit(v).agree


def test_auditor_rejects_accepted_without_invariants():
    checks = _ok_checks()
    checks["preserved_ok"] = False
    v = ValidatorVerdict("x", True, kind="data",
                         changed_files=["out.json"], checks=checks)
    assert not Auditor(None).audit(v).agree
