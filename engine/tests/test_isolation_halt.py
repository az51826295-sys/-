"""격리 위반 = 즉시 내구 정지 (4개월차 2주차 배선 검사)."""

import os
import subprocess

import pytest

from genesis.rookery.engine.auditor import (
    ISOLATION_HALT_FLAG, Auditor, engine_halted)
from genesis.rookery.engine.budget import BudgetGuard, BudgetPolicy
from genesis.rookery.engine.isolation import IsolationError
from genesis.rookery.engine.store import Store
from genesis.rookery.engine.worker import Engine, HandlerSpec


@pytest.fixture()
def repo(tmp_path):
    path = tmp_path / "repo"
    path.mkdir()
    env = {**os.environ, "GIT_AUTHOR_NAME": "t",
           "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=path,
                   check=True)
    (path / "a.py").write_text("x = 1\n", encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=path, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=path,
                   env=env, check=True)
    return str(path)


def escaping_handler(ctx):
    raise IsolationError("../outside.txt 쓰기 시도")


def test_isolation_error_halts_engine_durably(tmp_path, repo):
    store = Store(str(tmp_path / "e.db"))
    guard = BudgetGuard(store, BudgetPolicy(
        usd_krw=1000.0, fixed_monthly_krw=0.0, daily_krw=1e9,
        task_krw=1e9))
    eng = Engine(store, guard, Auditor(store), repo,
                 str(tmp_path / "work"),
                 handlers={"fix": HandlerSpec(escaping_handler,
                                              external=False)})
    store.add_task("t1", "fix", {}, max_attempts=1)
    store.add_task("t2", "fix", {}, max_attempts=1)
    eng.run_once("w1")
    # 위반 즉시: 내구 플래그 + 이후 claim 불가 (t2는 남는다)
    assert store.get_flag(ISOLATION_HALT_FLAG)
    assert engine_halted(store)
    assert eng.run_once("w1") is False
    assert store.get("t2")["state"] == "pending"
    assert store.get("t1")["state"] == "failed"
    # 재부팅(새 Store)에서도 유지 - 사람의 resume 전까지
    store2 = Store(str(tmp_path / "e.db"))
    assert engine_halted(store2)
    store.close()
    store2.close()
