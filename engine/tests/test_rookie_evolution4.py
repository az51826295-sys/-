"""루키 2.0 진화 4단계: 경험 기반 라우팅 (전부 가짜 API - 지출 0).

경험은 프롬프트가 아니라 선택(라우팅)에만 쓴다. 명시 tier는 언제나
경험을 이기고, 증거 문턱을 못 넘긴 이력은 기본값을 못 바꾼다.
"""

import os
import subprocess

import pytest

import genesis.rookery.engine.agentic as ag
from genesis.rookery.chat import snapshot
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


def outcomes(store):
    return [dict(r) for r in store.conn.execute(
        "SELECT json_extract(data,'$.tier') t,"
        " json_extract(data,'$.accepted') a,"
        " json_extract(data,'$.attempt') att"
        " FROM events WHERE kind='agent_outcome'")]


def seed_history(store, kind, n, accepted, tier="fast", attempt=1,
                 usd=None, wins=None):
    """가짜 이력 주입 - 라우팅이 읽는 것과 같은 이벤트 채널.
    wins가 주어지면 앞 wins건만 accepted."""
    for i in range(n):
        acc = accepted if wins is None else (i < wins)
        data = {"kind": kind, "tier": tier, "attempt": attempt,
                "accepted": acc, "steps": 3, "tool_calls": 2}
        if usd is not None:
            data["usd"] = usd
        store.log(f"h{kind}{tier}{attempt}{i}", None, "agent_outcome",
                  data)


FAST_USD, SMART_USD = 0.17, 1.1        # (b) 재검증 실측


def seed_smart_pays(store, kind="agent_fix"):
    """fast는 한 번도 못 풀고 smart는 8건 중 6건을 푼다 - smart 선행이
    해결당 더 싼 경우."""
    seed_history(store, kind, 8, accepted=False, usd=FAST_USD)
    seed_history(store, kind, 8, accepted=True, tier="smart",
                 usd=SMART_USD, wins=6)


def seed_measured_band(store, kind="agent_fix"):
    """(b) 재검증 실측: fast 1/13, smart 3/12, 가격 0.17 / 1.1 -
    fast 선행이 해결당 더 싸다 (실패의 가격)."""
    seed_history(store, kind, 13, accepted=False, usd=FAST_USD, wins=1)
    seed_history(store, kind, 12, accepted=False, tier="smart",
                 attempt=2, usd=SMART_USD, wins=3)


# ------------------------------------------------------ 결말 기록


def test_outcome_recorded_on_success(tmp_path, repo, monkeypatch):
    store, eng, _ = engine_with(tmp_path, repo, GOOD_SCRIPT,
                                monkeypatch)
    store.add_task("g1", "agent_fix", payload())
    eng.drain()
    rows = outcomes(store)
    assert len(rows) == 1
    assert rows[0]["t"] == "fast" and rows[0]["a"] == 1
    store.close()


def test_outcome_recorded_on_failure(tmp_path, repo, monkeypatch):
    lazy = [[tu(1, "done", summary="다 했다(거짓말)")]]
    store, eng, _ = engine_with(tmp_path, repo, lazy, monkeypatch)
    store.add_task("g1", "agent_fix", payload(), max_attempts=1)
    eng.drain()
    rows = outcomes(store)
    assert len(rows) == 1 and rows[0]["a"] == 0, \
        "실패한 시도도 경험이다 - 기록에 남아야 한다"
    store.close()


# --------------------------------------------------- 경험 라우팅 v2


def test_smart_that_pays_routes_smart(tmp_path):
    store = Store(str(tmp_path / "e.db"))
    seed_smart_pays(store)
    assert ag.pick_tier({}, 1, store=store,
                        kind="agent_fix") == "smart"
    store.close()


def test_price_of_failure_keeps_fast_in_the_measured_band(tmp_path):
    """(b) 재검증의 판정 근거: fast 승률 7.7%라도 시도가 smart의 15%
    값이면 fast 선행이 해결당 싸다. v1은 여기서 smart 직행을 골라
    손해를 봤다."""
    store = Store(str(tmp_path / "e.db"))
    seed_measured_band(store)
    assert ag.pick_tier({}, 1, store=store,
                        kind="agent_fix") == "fast"
    ef, es = ag.expected_cost_per_solve(1 / 13, 0.17, 3 / 12, 1.1)
    assert ef < es
    store.close()


def test_insufficient_evidence_keeps_default(tmp_path):
    store = Store(str(tmp_path / "e.db"))
    # fast만 있고 smart 표본이 없다
    seed_history(store, "agent_fix", ag.ROUTE_MIN_SAMPLES,
                 accepted=False, usd=FAST_USD)
    assert ag.pick_tier({}, 1, store=store, kind="agent_fix") == "fast", (
        "한쪽 계층만의 증거는 기본값을 못 바꾼다")
    # smart 표본은 있지만 가격이 없다 (시드 이력) - 가격은 측정만
    seed_history(store, "agent_fix", ag.ROUTE_MIN_SAMPLES,
                 accepted=True, tier="smart")
    assert ag.pick_tier({}, 1, store=store, kind="agent_fix") == "fast", (
        "가격 없는 승률만으로는 기본값을 못 바꾼다")
    store.close()


def test_success_history_keeps_fast(tmp_path):
    store = Store(str(tmp_path / "e.db"))
    seed_history(store, "agent_fix", ag.ROUTE_MIN_SAMPLES * 2,
                 accepted=True, usd=FAST_USD)
    seed_history(store, "agent_fix", ag.ROUTE_MIN_SAMPLES,
                 accepted=True, tier="smart", usd=SMART_USD)
    assert ag.pick_tier({}, 1, store=store,
                        kind="agent_fix") == "fast"
    store.close()


def test_experience_is_per_kind(tmp_path):
    store = Store(str(tmp_path / "e.db"))
    seed_smart_pays(store, kind="doc_agent")
    assert ag.pick_tier({}, 1, store=store, kind="agent_fix") == "fast", (
        "다른 종류의 경험이 이 종류의 라우팅을 오염시키면 안 된다")
    store.close()


def test_explicit_tier_beats_experience(tmp_path):
    store = Store(str(tmp_path / "e.db"))
    seed_smart_pays(store)
    assert ag.pick_tier({"tier": "fast"}, 1, store=store,
                        kind="agent_fix") == "fast", (
        "운영자 지시는 언제나 경험을 이긴다")
    store.close()


def test_smart_only_history_does_not_route(tmp_path):
    store = Store(str(tmp_path / "e.db"))
    seed_history(store, "agent_fix", ag.ROUTE_MIN_SAMPLES,
                 accepted=True, tier="smart", usd=SMART_USD)
    assert ag.pick_tier({}, 1, store=store,
                        kind="agent_fix") == "fast"
    store.close()


def test_retry_failures_do_not_count_as_fast_first_try(tmp_path):
    store = Store(str(tmp_path / "e.db"))
    seed_history(store, "agent_fix", ag.ROUTE_MIN_SAMPLES,
                 accepted=False, attempt=2, usd=FAST_USD)
    seed_history(store, "agent_fix", ag.ROUTE_MIN_SAMPLES,
                 accepted=True, tier="smart", usd=SMART_USD)
    assert ag.tier_stats(store, "agent_fix")["fast"]["n"] == 0
    assert ag.pick_tier({}, 1, store=store,
                        kind="agent_fix") == "fast"
    store.close()


def test_outcome_carries_the_price(tmp_path, repo, monkeypatch):
    """v2의 전제: 결말 이벤트에 실비가 실린다."""
    store, eng, _ = engine_with(tmp_path, repo, GOOD_SCRIPT, monkeypatch)
    store.add_task("g1", "agent_fix", payload())
    eng.drain()
    st = ag.tier_stats(store, "agent_fix")
    assert st["fast"]["n"] == 1 and st["fast"]["cost_n"] == 1
    assert st["fast"]["cost"] is not None and st["fast"]["cost"] > 0
    store.close()


def test_engine_run_routes_smart_after_history(tmp_path, repo,
                                               monkeypatch):
    seen = {}

    class SpyCaller(FakeCaller):
        def call(self, model, system, messages, tools):
            seen["model"] = model
            return super().call(model, system, messages, tools)

    caller = SpyCaller(list(GOOD_SCRIPT))
    monkeypatch.setattr(ag, "CALLER_FACTORY", lambda: caller)
    store = Store(str(tmp_path / "e.db"))
    seed_smart_pays(store)
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
    assert seen["model"] == ag.MODELS["smart"][0]
    assert store.get("g1")["state"] == "succeeded"
    store.close()


# ---------------------------------------------- edit_file (처방 ②)


class _Ws:
    def __init__(self, files):
        self.files = dict(files)

    def read_text(self, p):
        return self.files[p]

    def write_text(self, p, c):
        self.files[p] = c


class _Ctx:
    def __init__(self, ws):
        self.workspace = ws


def test_edit_file_replaces_unique_match():
    ws = _Ws({"mod.py": "def f():\n    return 1\n\ndef g():\n"
                        "    return 2\n"})
    out = ag._exec_tool(_Ctx(ws), "edit_file", {
        "path": "mod.py", "old": "    return 1",
        "new": "    return 10"})
    assert out == "교체됨"
    assert "return 10" in ws.files["mod.py"]
    assert "return 2" in ws.files["mod.py"]


def test_edit_file_rejects_ambiguous_and_missing():
    ws = _Ws({"mod.py": "x = 1\nx = 1\n"})
    out = ag._exec_tool(_Ctx(ws), "edit_file", {
        "path": "mod.py", "old": "x = 1", "new": "x = 2"})
    assert "2번" in out
    out = ag._exec_tool(_Ctx(ws), "edit_file", {
        "path": "mod.py", "old": "없는 줄", "new": "y"})
    assert "없다" in out
    assert ws.files["mod.py"] == "x = 1\nx = 1\n"


def test_edit_file_protects_test_files():
    ws = _Ws({"test_mod.py": "assert True\n"})
    out = ag._exec_tool(_Ctx(ws), "edit_file", {
        "path": "test_mod.py", "old": "True", "new": "False"})
    assert "거부" in out


# --------------------------------------------------- 변경 목록 위생


def test_git_changed_ignores_compiled_caches():
    class WsRun:
        def run(self, argv, timeout=60):
            import types
            return types.SimpleNamespace(stdout=(
                " M mod.py\n"
                "?? __pycache__/test_mod.cpython-312.pyc\n"
                "?? sub/__pycache__/x.pyc\n"))
    assert ag._git_changed(WsRun()) == ["mod.py"], \
        ".pyc는 소스 변경이 아니다 - 감사 오탐(목 파일럿 실증) 방지"


# ------------------------------------------------------- 대화 노출


def test_chat_snapshot_shows_experience(tmp_path):
    db = str(tmp_path / "e.db")
    store = Store(db)
    seed_history(store, "agent_fix", 5, accepted=True)
    store.close()
    ctx = snapshot(db)
    assert "에이전트 경험" in ctx and "agent_fix/fast=5/5" in ctx
