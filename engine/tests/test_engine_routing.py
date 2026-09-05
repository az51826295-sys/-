"""무인 운영 라우팅·게이트 검사 (4개월차 1주차)."""

from genesis.rookery.engine.routing import (
    DELEGATION, FAST, SMART, requires_approval, route)
from genesis.rookery.engine.store import Task
from genesis.rookery.engine.worker import Engine


def test_delegation_list_is_exactly_the_measured_one():
    """위임 목록은 실패 역산 결과 하나뿐이어야 한다 - 항목이
    늘었다면 원장 재집계가 선행됐는지 확인하라."""
    assert DELEGATION == {("test_add", "retry"): SMART}


def test_route_only_delegates_measured_type_on_retry():
    assert route("test_add", 1) == FAST      # 1차는 기본 경로
    assert route("test_add", 2) == SMART     # 측정된 실패 유형만
    assert route("fix", 2) == FAST           # 상상 위임 없음
    assert route("doc", 3) == FAST
    assert route("agent_fix", 2) == FAST     # agent_fix는 자체 승급


def test_irreversible_actions_require_approval():
    assert requires_approval("git push --force origin main")
    assert requires_approval("git branch -D rookery/x")
    assert requires_approval("gh pr merge 3")
    assert not requires_approval("git push origin rookery/x")
    assert not requires_approval("pytest -q")


class _F:
    def __init__(self, name):
        self.name = name

    def __call__(self):
        return self.name


class _Log:
    def __init__(self):
        self.events = []

    def log(self, *a, **k):
        self.events.append(a)


def _engine(smart):
    e = Engine.__new__(Engine)
    e.client_factory = _F("fast")
    e.smart_client_factory = _F("smart") if smart else None
    e.store = _Log()
    return e


def _task(kind, attempts):
    return Task(id="t", kind=kind, payload={}, state="leased",
                attempts=attempts, max_attempts=3, run_id=1)


def test_engine_picks_smart_factory_on_measured_retry():
    e = _engine(smart=True)
    assert e._pick_client_factory(_task("test_add", 2))() == "smart"
    assert e.store.events, "라우팅 결정은 원장에 남아야 한다"
    assert e._pick_client_factory(_task("test_add", 1))() == "fast"
    assert e._pick_client_factory(_task("fix", 2))() == "fast"


def test_engine_falls_back_without_smart_factory():
    e = _engine(smart=False)
    assert e._pick_client_factory(_task("test_add", 2))() == "fast"
