"""루키 2.0 에이전트 루프 검증 (전부 가짜 API - 지출 0).

The evolved proposer must stay inside the old institutions: tools go
through the workspace (containment, test-file ban), every model call
lands on the ledger, and adoption still requires the fail->pass
oracle plus the auditor.
"""

import os
import subprocess

import pytest

import genesis.rookery.engine.agentic as ag
from genesis.rookery.engine.auditor import Auditor
from genesis.rookery.engine.budget import BudgetGuard, BudgetPolicy
from genesis.rookery.engine.store import Store
from genesis.rookery.engine.worker import Engine, HandlerSpec

BUGGY = "def sq(x):\n    return x + x\n"
FIXED = "def sq(x):\n    return x * x\n"
TEST = ("import mod\n\n\ndef test_sq():\n"
        "    assert mod.sq(3) == 9\n")


@pytest.fixture()
def repo(tmp_path):
    path = tmp_path / "repo"
    path.mkdir()
    env = {**os.environ, "GIT_AUTHOR_NAME": "t",
           "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=path,
                   check=True)
    (path / "mod.py").write_text(BUGGY, encoding="utf-8")
    (path / "test_mod.py").write_text(TEST, encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=path, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=path,
                   env=env, check=True)
    return str(path)


def tu(i, name, **inp):
    return {"type": "tool_use", "id": f"t{i}", "name": name,
            "input": inp}


class FakeCaller:
    """대본대로 응답하는 가짜 모델. 대본 소진 후엔 done만 말한다."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = 0

    def call(self, model, system, messages, tools):
        self.calls += 1
        if self.script:
            content = self.script.pop(0)
        else:
            content = [tu(99, "done", summary="끝")]
        return {"content": content,
                "usage": {"input_tokens": 100, "output_tokens": 50}}


GOOD_SCRIPT = [
    [tu(1, "read_file", path="mod.py")],
    [tu(2, "write_file", path="mod.py", content=FIXED)],
    [tu(3, "run_tests", test_ids=["test_mod.py::test_sq"])],
    [tu(4, "done", summary="고침")],
]


def engine_with(tmp_path, repo, script, monkeypatch):
    caller = FakeCaller(script)
    monkeypatch.setattr(ag, "CALLER_FACTORY", lambda: caller)
    store = Store(str(tmp_path / "e.db"))
    guard = BudgetGuard(store, BudgetPolicy(
        usd_krw=1000.0, fixed_monthly_krw=0.0, daily_krw=1e9,
        task_krw=1e9))
    eng = Engine(
        store, guard, Auditor(store), repo, str(tmp_path / "work"),
        handlers={"agent_fix": HandlerSpec(ag.agent_fix_handler,
                                           external=True)},
        client_factory=lambda: None)
    return store, eng, caller


def payload(**over):
    base = {"file": "mod.py",
            "repro_tests": ["test_mod.py::test_sq"],
            "smoke_tests": [], "issue": "sq가 제곱이 아니라 덧셈",
            "change_kind": "code", "test_id": "test_mod.py::test_sq",
            "symbol": "sq"}
    base.update(over)
    return base


def test_agent_fixes_and_is_adopted(tmp_path, repo, monkeypatch):
    store, eng, caller = engine_with(tmp_path, repo, GOOD_SCRIPT,
                                     monkeypatch)
    store.add_task("g1", "agent_fix", payload())
    eng.drain()
    row = store.get("g1")
    assert row["state"] == "succeeded", row["last_error"]
    assert not eng.auditor.halted()
    store.close()


def test_every_step_is_on_the_ledger(tmp_path, repo, monkeypatch):
    store, eng, caller = engine_with(tmp_path, repo, GOOD_SCRIPT,
                                     monkeypatch)
    store.add_task("g1", "agent_fix", payload())
    eng.drain()
    n = store.conn.execute(
        "SELECT COUNT(*) FROM reservations WHERE state='settled'"
    ).fetchone()[0]
    assert n == caller.calls and n >= 4, \
        "호출 수와 정산 수가 다르면 원장 밖 지출이 있다는 뜻"
    store.close()


def test_agent_cannot_touch_test_files(tmp_path, repo, monkeypatch):
    evil = [
        [tu(1, "write_file", path="test_mod.py",
            content="def test_sq():\n    assert True\n")],
        [tu(2, "done", summary="테스트를 고쳤다")],
    ]
    store, eng, caller = engine_with(tmp_path, repo, evil,
                                     monkeypatch)
    store.add_task("g1", "agent_fix", payload(), max_attempts=1)
    eng.drain()
    assert store.get("g1")["state"] == "failed"
    assert not eng.auditor.halted()
    # 사람 체크아웃의 테스트 파일이 무사한가
    with open(os.path.join(repo, "test_mod.py"),
              encoding="utf-8") as f:
        assert "assert mod.sq(3) == 9" in f.read()
    store.close()


def test_step_cap_stops_a_wanderer(tmp_path, repo, monkeypatch):
    wander = [[tu(i, "read_file", path="mod.py")]
              for i in range(50)]
    store, eng, caller = engine_with(tmp_path, repo, wander,
                                     monkeypatch)
    store.add_task("g1", "agent_fix", payload(), max_attempts=1)
    eng.drain()
    assert store.get("g1")["state"] == "failed"
    assert caller.calls <= ag.MAX_STEPS
    store.close()


def test_unverified_done_is_rejected(tmp_path, repo, monkeypatch):
    lazy = [[tu(1, "done", summary="다 했다(거짓말)")]]
    store, eng, caller = engine_with(tmp_path, repo, lazy,
                                     monkeypatch)
    store.add_task("g1", "agent_fix", payload(), max_attempts=1)
    eng.drain()
    assert store.get("g1")["state"] == "failed"
    assert not eng.auditor.halted()
    store.close()


def test_premature_done_is_rejected_then_agent_recovers(
        tmp_path, repo, monkeypatch):
    """능력 실험 2 H1: 미검증 done은 반려되고, 같은 시도 안에서
    수정을 이어가면 채택될 수 있다."""
    script = [
        [tu(1, "done", summary="벌써 끝(거짓)")],      # 반려돼야 함
        [tu(2, "write_file", path="mod.py", content=FIXED)],
        [tu(3, "run_tests", test_ids=["test_mod.py::test_sq"])],
        [tu(4, "done", summary="진짜 끝")],
    ]
    store, eng, caller = engine_with(tmp_path, repo, script,
                                     monkeypatch)
    store.add_task("g1", "agent_fix", payload())
    eng.drain()
    assert store.get("g1")["state"] == "succeeded"
    rej = [e for e in store.events(kind="agent_loop_stats")
           if '"done_rejections": 1' in e["data"]]
    assert rej, "반려 1회가 원장에 남아야 한다"


def test_no_tool_response_gets_one_nudge(tmp_path, repo,
                                         monkeypatch):
    """능력 실험 2 H2: 무도구 응답은 1회 재촉 후 계속된다."""
    script = [
        [{"type": "text", "text": "생각 중입니다..."}],   # 재촉 대상
        [tu(1, "write_file", path="mod.py", content=FIXED)],
        [tu(2, "run_tests", test_ids=["test_mod.py::test_sq"])],
        [tu(3, "done", summary="끝")],
    ]
    store, eng, caller = engine_with(tmp_path, repo, script,
                                     monkeypatch)
    store.add_task("g1", "agent_fix", payload())
    eng.drain()
    assert store.get("g1")["state"] == "succeeded"
    stats = [e for e in store.events(kind="agent_loop_stats")
             if '"nudged": true' in e["data"]]
    assert stats, "재촉 발동이 원장에 남아야 한다"


def test_agent_responses_are_on_the_ledger(tmp_path, repo,
                                           monkeypatch):
    """관측 수리: 응답 원문이 원장에 남는다 - run 1 부검 불가
    사각지대의 제거."""
    store, eng, caller = engine_with(tmp_path, repo, GOOD_SCRIPT,
                                     monkeypatch)
    store.add_task("g1", "agent_fix", payload())
    eng.drain()
    assert store.events(kind="agent_response")


def test_scratch_files_do_not_reach_the_adopted_commit(
        tmp_path, repo, monkeypatch):
    """능력 실험 4 부검: 에이전트의 빈 스크래치 파일(tmp_out.txt,
    tmp_show.py)이 git add -A 채택 커밋에 혼입됐다. 커밋 전 위생
    규칙이 기계적으로 걸러야 한다 - 프롬프트 부탁이 아니라."""
    script = [
        [tu(1, "write_file", path="tmp_show.py", content=""),
         tu(2, "write_file", path="tmp_out.txt", content="")],
        [tu(3, "write_file", path="mod.py", content=FIXED)],
        [tu(4, "run_tests", test_ids=["test_mod.py::test_sq"])],
        [tu(5, "done", summary="끝")],
    ]
    store, eng, caller = engine_with(tmp_path, repo, script,
                                     monkeypatch)
    store.add_task("g1", "agent_fix", payload())
    eng.drain()
    row = store.get("g1")
    assert row["state"] == "succeeded", row["last_error"]
    assert not eng.auditor.halted()
    # 채택 브랜치의 트리에 스크래치가 없어야 한다
    tree = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", "rookery/g1"],
        cwd=repo, capture_output=True, text=True).stdout
    assert "mod.py" in tree
    assert "tmp_out.txt" not in tree and "tmp_show.py" not in tree
    fixed = subprocess.run(
        ["git", "show", "rookery/g1:mod.py"], cwd=repo,
        capture_output=True, text=True).stdout
    assert "x * x" in fixed
    assert store.events(kind="scratch_sweep"), \
        "위생 규칙 발동이 원장에 남아야 한다"
    store.close()


def test_load_bearing_new_file_is_restored_and_halts_audit(
        tmp_path, repo, monkeypatch):
    """신규 파일을 지우면 재현이 깨진다 = 수정의 일부다. 위생
    규칙은 복원하되 조용히 채택하지 않는다 - 감사 I6(신규 파일
    규율)이 정지시켜 사람이 보게 한다."""
    script = [
        [tu(1, "write_file", path="helper.py",
            content="def sq(x):\n    return x * x\n")],
        [tu(2, "write_file", path="mod.py",
            content="from helper import sq\n")],
        [tu(3, "run_tests", test_ids=["test_mod.py::test_sq"])],
        [tu(4, "done", summary="끝")],
    ]
    store, eng, caller = engine_with(tmp_path, repo, script,
                                     monkeypatch)
    store.add_task("g1", "agent_fix", payload(), max_attempts=1)
    eng.drain()
    assert store.get("g1")["state"] == "failed"
    assert eng.auditor.halted(), \
        "살아남은 신규 파일은 조용한 채택이 아니라 정지여야 한다"
    assert store.events(kind="scratch_restore"), \
        "복원 발동이 원장에 남아야 한다"
    store.close()


def test_malformed_tool_call_is_a_tool_error_not_a_crash(
        tmp_path, repo, monkeypatch):
    """(b) 재검증 B팔 0차: max_tokens 절단으로 edit_file에 old가
    빠진 호출이 KeyError → worker_exception으로 smart 시도를
    즉사시켰다. 인자 누락은 도구 오류로 돌려주고 루프는 계속된다."""
    script = [
        [tu(1, "edit_file", path="mod.py")],          # old/new 누락
        [tu(2, "run_tests")],                          # test_ids 누락
        [tu(3, "write_file", path="mod.py", content=FIXED)],
        [tu(4, "run_tests", test_ids=["test_mod.py::test_sq"])],
        [tu(5, "done", summary="끝")],
    ]
    store, eng, caller = engine_with(tmp_path, repo, script,
                                     monkeypatch)
    store.add_task("g1", "agent_fix", payload())
    eng.drain()
    row = store.get("g1")
    assert row["state"] == "succeeded", row["last_error"]
    assert not store.events(kind="worker_exception")
    store.close()


def test_truncated_response_is_logged(tmp_path, repo, monkeypatch):
    class TruncCaller(FakeCaller):
        def call(self, model, system, messages, tools):
            out = super().call(model, system, messages, tools)
            if self.calls == 1:
                out["stop_reason"] = "max_tokens"
            return out

    caller = TruncCaller(list(GOOD_SCRIPT))
    monkeypatch.setattr(ag, "CALLER_FACTORY", lambda: caller)
    store = Store(str(tmp_path / "e.db"))
    guard = BudgetGuard(store, BudgetPolicy(
        usd_krw=1000.0, fixed_monthly_krw=0.0, daily_krw=1e9,
        task_krw=1e9))
    eng = Engine(
        store, guard, Auditor(store), repo, str(tmp_path / "work"),
        handlers={"agent_fix": HandlerSpec(ag.agent_fix_handler,
                                           external=True)},
        client_factory=lambda: None)
    store.add_task("g1", "agent_fix", payload())
    eng.drain()
    assert store.events(kind="agent_truncated")
    store.close()


def test_thinking_models_get_the_larger_max_tokens():
    """사고 토큰이 max_tokens에 포함되는 모델(Opus 5, Sonnet 5)은
    4000이면 도구 호출이 잘린다 - B팔 0차 부검."""
    assert ag.max_tokens_for(ag.MODELS["opus"][0]) ==         ag.THINKING_MAX_TOKENS
    assert ag.max_tokens_for(ag.MODELS["smart"][0]) ==         ag.THINKING_MAX_TOKENS
    assert ag.max_tokens_for(ag.MODELS["fast"][0]) == ag.MAX_TOKENS


def test_tier_routes_model(tmp_path, repo, monkeypatch):
    seen = {}

    class SpyCaller(FakeCaller):
        def call(self, model, system, messages, tools):
            seen["model"] = model
            return super().call(model, system, messages, tools)

    caller = SpyCaller(list(GOOD_SCRIPT))
    monkeypatch.setattr(ag, "CALLER_FACTORY", lambda: caller)
    store = Store(str(tmp_path / "e.db"))
    guard = BudgetGuard(store, BudgetPolicy(
        usd_krw=1000.0, fixed_monthly_krw=0.0, daily_krw=1e9,
        task_krw=1e9))
    eng = Engine(
        store, guard, Auditor(store), repo, str(tmp_path / "work"),
        handlers={"agent_fix": HandlerSpec(ag.agent_fix_handler,
                                           external=True)},
        client_factory=lambda: None)
    store.add_task("g1", "agent_fix", payload(tier="smart"))
    eng.drain()
    assert seen["model"] == ag.MODELS["smart"][0]
    store.close()
