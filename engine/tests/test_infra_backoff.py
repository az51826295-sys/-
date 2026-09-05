"""인프라 백오프 검사 - 드라이런 1차의 16시간 무의미 재시도 루프
재발 방지 (연속 소켓 오류 5회 -> 외부 작업 30분 내구 정지)."""

import os
import subprocess
import time

import pytest

from genesis.rookery.engine.auditor import Auditor
from genesis.rookery.engine.budget import BudgetGuard, BudgetPolicy
from genesis.rookery.engine.store import Store
from genesis.rookery.engine.worker import (
    INFRA_BACKOFF_FLAG, INFRA_THRESHOLD, Engine, HandlerSpec)


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


def socket_dead_handler(ctx):
    raise RuntimeError(
        "<urlopen error [WinError 10055] 큐 공간 또는 버퍼 부족>")


def make_engine(tmp_path, repo, external=True):
    store = Store(str(tmp_path / "e.db"))
    guard = BudgetGuard(store, BudgetPolicy(
        usd_krw=1000.0, fixed_monthly_krw=0.0, daily_krw=1e9,
        task_krw=1e9))
    eng = Engine(store, guard, Auditor(store), repo,
                 str(tmp_path / "work"),
                 handlers={
                     "fix": HandlerSpec(socket_dead_handler,
                                        external=external),
                     "tidy": HandlerSpec(socket_dead_handler,
                                         external=False)})
    return store, eng


def test_consecutive_infra_errors_trigger_backoff(tmp_path, repo):
    store, eng = make_engine(tmp_path, repo)
    for i in range(INFRA_THRESHOLD):
        store.add_task(f"t{i}", "fix", {}, max_attempts=1)
    while eng.run_once("w"):
        pass
    assert store.get_flag(INFRA_BACKOFF_FLAG), \
        "연속 5회 인프라 오류면 백오프가 서야 한다"
    # 백오프 중 외부 작업은 claim 불가
    store.add_task("blocked", "fix", {}, max_attempts=1)
    assert eng._claimable_kinds() == ["tidy"]


def test_backoff_expires_by_time(tmp_path, repo):
    store, eng = make_engine(tmp_path, repo)
    store.set_flag(INFRA_BACKOFF_FLAG, time.time() - 1)   # 이미 만료
    assert eng._infra_backed_off() is False
    assert eng._claimable_kinds() is None


def test_success_clears_backoff(tmp_path, repo):
    store, eng = make_engine(tmp_path, repo)
    store.set_flag(INFRA_BACKOFF_FLAG, time.time() + 999)
    eng._note_processed_ok()
    assert not store.get_flag(INFRA_BACKOFF_FLAG)


def test_non_infra_errors_do_not_count(tmp_path, repo):
    store, eng = make_engine(tmp_path, repo)
    for _ in range(INFRA_THRESHOLD + 1):
        eng._note_infra_failure("validator rejected")
    assert not store.get_flag(INFRA_BACKOFF_FLAG), \
        "검증 기각은 인프라가 아니다 - 백오프 불산입"


def test_infra_error_does_not_burn_an_attempt(tmp_path, repo):
    """(b) 재검증 B팔 1차: 크레딧 소진 400이 13건의 시도를 전부
    태웠다. 인프라 오류는 일을 시작도 못 한 것 - 시도를 돌려주고
    pending으로 기다린다."""
    store, eng = make_engine(tmp_path, repo)
    store.add_task("t0", "fix", {}, max_attempts=1)
    assert eng.run_once("w")
    row = store.get("t0")
    assert row["state"] == "pending", row["state"]
    assert row["attempts"] == 0, "인프라 오류에 시도가 소모되면 안 된다"
    assert any(e["kind"] == "infra_requeue" for e in store.events())


def test_credit_exhaustion_is_infra(tmp_path, repo):
    from genesis.rookery.engine.worker import is_infra_error
    assert is_infra_error(
        "HTTP 400: {\"type\":\"error\",\"error\":{\"message\":"
        "\"Your credit balance is too low to access the API\"}}")
    assert is_infra_error("HTTP 529: overloaded_error")
    assert not is_infra_error("HTTP 400: invalid_request_error: "
                              "messages.1.content is required")
    assert not is_infra_error("validator rejected")
