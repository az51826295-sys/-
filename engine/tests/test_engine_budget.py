"""Alpha step 2: budget guard - atomic reservations.

Every required test from the spec, plus the reboot and local-work
cases. Prices are set to 1 USD per million tokens so the arithmetic
in the tests is readable; the guard never assumes a price itself.
"""

import json
import os
import subprocess
import sys
import textwrap
import threading
from datetime import datetime, timedelta

import pytest

from genesis.rookery.engine.api import (
    AuthFailed, BudgetStopped, CreditExhausted, GuardedClient,
    classify_error)
from genesis.rookery.engine.budget import (
    FC_CREDIT, FC_DAILY, FC_INTERNAL, FC_OVERAGE, FC_STAGE,
    FC_TASK_CAP, BudgetGuard, BudgetPolicy, Denied, NORMAL,
    RESTRICTED, STOPPED, WARN)
from genesis.rookery.engine.store import Store


def make(tmp_path, **kw):
    store = Store(str(tmp_path / "engine.db"))
    policy = BudgetPolicy(usd_krw=1000.0, **kw)
    return store, BudgetGuard(store, policy)


@pytest.fixture()
def sg(tmp_path):
    store, guard = make(tmp_path)
    yield store, guard
    store.close()


# ------------------------------------------------------ stage policy


def test_stage_thresholds():
    p = BudgetPolicy()
    assert p.stage(0) == NORMAL
    assert p.stage(35_000) == WARN
    assert p.stage(40_000) == RESTRICTED
    assert p.stage(45_000) == STOPPED


def test_candidate_budget_by_risk_and_stage():
    p = BudgetPolicy()
    assert p.max_candidates("low", NORMAL) == 1
    assert p.max_candidates("medium", NORMAL) == 2
    assert p.max_candidates("high", NORMAL) == 3
    assert p.max_candidates("high", WARN) == 3
    # spec: from 40,000 KRW every task drops to one candidate
    assert p.max_candidates("high", RESTRICTED) == 1
    assert p.max_candidates("medium", RESTRICTED) == 1
    assert p.max_candidates("high", STOPPED) == 1
    assert not p.allows_high_cost(RESTRICTED)


# ------------------------------------------------------- reservation


def test_reserve_settle_frees_unused(sg):
    store, guard = sg
    res = guard.reserve(1000.0, task_id="t1")
    assert not isinstance(res, Denied)
    assert guard.status().held_krw == 1000.0
    guard.settle(res, usd=0.4)                # 400 KRW actual
    st = guard.status()
    assert st.held_krw == 0 and st.settled_krw == 400.0
    row = store.conn.execute(
        "SELECT * FROM reservations WHERE id=?", (res.id,)).fetchone()
    assert row["state"] == "settled"
    assert row["delta_krw"] == pytest.approx(-600.0)
    assert row["usd"] == pytest.approx(0.4) and row["rate"] == 1000.0


def test_release_returns_whole_estimate(sg):
    _, guard = sg
    res = guard.reserve(1200.0, task_id="t1")
    guard.release(res, "call_failed")
    st = guard.status()
    assert st.held_krw == 0 and st.settled_krw == 0


def test_overage_recorded_and_blocks_next_call(sg):
    store, guard = sg
    res = guard.reserve(100.0, task_id="t1")
    delta = guard.settle(res, usd=0.5)         # 500 actual vs 100 est
    assert delta == pytest.approx(400.0)
    assert any(e["kind"] == "budget_overage" for e in store.events())
    nxt = guard.reserve(100.0, task_id="t1")
    assert isinstance(nxt, Denied) and nxt.code == FC_OVERAGE
    after = guard.reserve(100.0, task_id="t1")   # one-shot breaker
    assert not isinstance(after, Denied)


def test_daily_cap(tmp_path):
    store, guard = make(tmp_path, daily_krw=1000.0, task_krw=1e9)
    assert not isinstance(guard.reserve(900.0, task_id="a"), Denied)
    denied = guard.reserve(200.0, task_id="b")
    assert isinstance(denied, Denied) and denied.code == FC_DAILY
    store.close()


def test_task_cap(tmp_path):
    store, guard = make(tmp_path, task_krw=500.0)
    assert not isinstance(guard.reserve(400.0, task_id="t1"), Denied)
    d = guard.reserve(200.0, task_id="t1")
    assert isinstance(d, Denied) and d.code == FC_TASK_CAP
    assert not isinstance(guard.reserve(400.0, task_id="t2"), Denied)
    store.close()


def test_reservation_cannot_cross_stop_line(tmp_path):
    store, guard = make(tmp_path, fixed_monthly_krw=15_000,
                        daily_krw=1e9, task_krw=1e9)
    r = guard.reserve(29_000.0, task_id="t1")     # 15k + 29k = 44k
    guard.settle(r, usd=29.0)
    guard.reserve(1.0, task_id="t1")              # clear overage flag
    d = guard.reserve(2_000.0, task_id="t2")
    assert isinstance(d, Denied) and d.code == FC_INTERNAL
    assert guard.status().month_total_krw < 45_000
    store.close()


def test_stage_stop_blocks_external_but_not_local(tmp_path):
    store, guard = make(tmp_path, fixed_monthly_krw=15_000,
                        daily_krw=1e9, task_krw=1e9)
    r = guard.reserve(30_000.0, task_id="t1")
    guard.settle(r, usd=30.0)                     # total 45k -> STOPPED
    guard.reserve(1.0, task_id="t1")              # clear overage flag
    assert guard.status().stage == STOPPED
    d = guard.reserve(100.0, task_id="t2", external=True)
    assert isinstance(d, Denied) and d.code == FC_STAGE
    local = guard.reserve(0.0, task_id="t3", external=False)
    assert not isinstance(local, Denied), \
        "local work must keep running at every stage"
    ok, _ = guard.allow_new_work(external=False)
    assert ok
    store.close()


def test_hard_ceiling_unreachable(tmp_path):
    """No sequence of reservations may reach 50,000 KRW."""
    store, guard = make(tmp_path, fixed_monthly_krw=15_000,
                        daily_krw=1e9, task_krw=1e9)
    for i in range(60):
        r = guard.reserve(1_000.0, task_id=f"t{i}")
        if isinstance(r, Denied):
            continue
        guard.settle(r, usd=1.0)
    assert guard.status().month_total_krw < guard.policy.hard_ceiling_krw
    assert guard.status().month_total_krw <= 45_000
    store.close()


def test_eight_workers_cannot_exceed_limit(tmp_path):
    """Spec test 1: concurrent reservations, zero overshoot."""
    path = str(tmp_path / "engine.db")
    seed = Store(path)
    seed.close()
    granted: list[float] = []
    lock = threading.Lock()

    def run():
        s = Store(path)
        g = BudgetGuard(s, BudgetPolicy(
            usd_krw=1000.0, fixed_monthly_krw=0.0, stop_krw=10_000.0,
            daily_krw=1e9, task_krw=1e9))
        for _ in range(30):
            r = g.reserve(300.0, task_id=None)
            if isinstance(r, Denied):
                continue
            g.settle(r, usd=0.3)
            with lock:
                granted.append(300.0)
        s.close()

    threads = [threading.Thread(target=run) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    store = Store(path)
    guard = BudgetGuard(store, BudgetPolicy(
        usd_krw=1000.0, fixed_monthly_krw=0.0, stop_krw=10_000.0))
    assert guard.status().month_total_krw <= 10_000.0
    assert sum(granted) <= 10_000.0
    store.close()


def test_expired_reservation_is_reclaimed(sg):
    """Spec test 2: worker dies holding a reservation."""
    store, guard = sg
    guard.policy.reservation_ttl_s = 0.0
    res = guard.reserve(2000.0, task_id="t1", worker="doomed")
    assert guard.status().held_krw == 0, \
        "an expired hold must not block the budget"
    assert guard.sweep_expired() == 1
    row = store.conn.execute("SELECT * FROM reservations WHERE id=?",
                             (res.id,)).fetchone()
    assert row["state"] == "expired"
    assert row["failure_code"] == "worker_lost"


# ------------------------------------------------ boundaries, reboot


def test_day_and_month_boundaries_reset(tmp_path):
    store, guard = make(tmp_path, daily_krw=1000.0, task_krw=1e9)
    now = datetime(2026, 8, 3, 12, 0).timestamp()
    r = guard.reserve(900.0, task_id="t1", now=now)
    guard.settle(r, usd=0.9, now=now)
    tomorrow = datetime(2026, 8, 4, 12, 0).timestamp()
    assert guard.status(tomorrow).today_krw == 0, "daily window resets"
    assert guard.status(tomorrow).settled_krw == 900.0, \
        "still inside the same month"
    next_month = datetime(2026, 9, 2, 12, 0).timestamp()
    assert guard.status(next_month).settled_krw == 0, "month resets"
    store.close()


def test_ledger_survives_reboot(tmp_path):
    """Spec test 6: reboot preserves the cost ledger."""
    path = str(tmp_path / "engine.db")
    s1 = Store(path)
    g1 = BudgetGuard(s1, BudgetPolicy(usd_krw=1000.0))
    r = g1.reserve(500.0, task_id="t1")
    g1.settle(r, usd=0.5)
    s1.close()
    s2 = Store(path)                                  # reboot
    g2 = BudgetGuard(s2, BudgetPolicy(usd_krw=1000.0))
    assert g2.status().settled_krw == 500.0
    s2.close()


KILL_SCRIPT = textwrap.dedent("""
    import os, sys
    sys.path.insert(0, sys.argv[2])
    from genesis.rookery.engine.store import Store
    from genesis.rookery.engine.budget import BudgetGuard, BudgetPolicy
    s = Store(sys.argv[1])
    g = BudgetGuard(s, BudgetPolicy(usd_krw=1000.0,
                                    reservation_ttl_s=0.0,
                                    daily_krw=1e9, task_krw=1e9))
    r = g.reserve(4000.0, task_id="t1", worker="doomed")
    print("RESERVED", r.id)
    sys.stdout.flush()
    os._exit(9)
""")


def test_reservation_reclaimed_after_hard_kill(tmp_path):
    path = str(tmp_path / "engine.db")
    script = tmp_path / "kill.py"
    script.write_text(KILL_SCRIPT, encoding="utf-8")
    Store(path).close()
    proc = subprocess.run(
        [sys.executable, str(script), path, os.getcwd()],
        capture_output=True, text=True, encoding="utf-8",
        errors="replace")
    assert proc.returncode == 9 and "RESERVED" in proc.stdout
    store = Store(path)
    guard = BudgetGuard(store, BudgetPolicy(usd_krw=1000.0))
    assert guard.sweep_expired() == 1
    assert guard.status().held_krw == 0
    store.close()


# ---------------------------------------------------- guarded client


class FakeProvider:
    def __init__(self, script):
        self.script = list(script)
        self.usage = {"calls": 0, "input_tokens": 0,
                      "output_tokens": 0}

    def complete(self, prompt, temperature, a, b):
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        self.usage["calls"] += 1
        self.usage["input_tokens"] += item[0]
        self.usage["output_tokens"] += item[1]
        return item[2]


def client(tmp_path, script, **kw):
    store, guard = make(tmp_path, **kw)
    return store, guard, GuardedClient(
        FakeProvider(script), store, guard,
        usd_per_mtok_in=1.0, usd_per_mtok_out=1.0,
        base_delay=0.0, sleep=lambda s: None)


def test_error_classification():
    assert classify_error(RuntimeError(
        "HTTP 400: your credit balance is too low")) == "credit"
    assert classify_error(RuntimeError(
        "HTTP 401 authentication_error")) == "auth"
    assert classify_error(RuntimeError("HTTP 429 rate limit")) \
        == "retryable"
    assert classify_error(RuntimeError(
        "HTTP 400 temperature: range: 0..1")) == "permanent"


def test_call_settles_and_records(tmp_path):
    store, guard, c = client(tmp_path, [(1000, 500, "ok")])
    out = c.complete("hello", task_id="t1", max_tokens=100)
    assert out.text == "ok"
    st = guard.status()
    assert st.settled_krw == pytest.approx(1.5)     # 1500 tok @1000KRW/M
    assert st.held_krw == 0
    store.close()


def test_call_failure_releases_reservation(tmp_path):
    """Spec test 3."""
    store, guard, c = client(
        tmp_path, [RuntimeError("HTTP 400 malformed")])
    with pytest.raises(RuntimeError):
        c.complete("hello", task_id="t1", max_tokens=100)
    assert guard.status().held_krw == 0
    assert guard.status().settled_krw == 0
    store.close()


def test_credit_error_is_not_retried_and_frees_hold(tmp_path):
    store, guard, c = client(
        tmp_path,
        [RuntimeError("HTTP 400 credit balance is too low")] * 3)
    with pytest.raises(CreditExhausted):
        c.complete("hi", task_id="t1", max_tokens=50)
    assert c.provider.usage["calls"] == 0
    assert len(c.provider.script) == 2, "must not retry a credit error"
    row = store.conn.execute(
        "SELECT failure_code FROM reservations").fetchone()
    assert row["failure_code"] == FC_CREDIT, \
        "credit exhaustion and internal cap must stay distinguishable"
    store.close()


def test_auth_error_is_not_retried(tmp_path):
    store, guard, c = client(
        tmp_path, [RuntimeError("HTTP 401 authentication_error")] * 3)
    with pytest.raises(AuthFailed):
        c.complete("hi", task_id="t1", max_tokens=50)
    assert len(c.provider.script) == 2
    store.close()


def test_retryable_error_retries_then_succeeds(tmp_path):
    store, guard, c = client(
        tmp_path, [RuntimeError("HTTP 529 overloaded"),
                   (100, 50, "ok")])
    out = c.complete("hi", task_id="t1", max_tokens=50)
    assert out.text == "ok" and out.attempts == 2
    assert c.usage.retries == 1
    store.close()


def test_no_api_calls_after_stop_line(tmp_path):
    """Spec test 7: at 45,000 KRW the client makes zero calls."""
    store, guard, c = client(tmp_path, [(100, 50, "should not run")],
                             fixed_monthly_krw=15_000,
                             daily_krw=1e9, task_krw=1e9)
    r = guard.reserve(30_000.0, task_id="seed")
    guard.settle(r, usd=30.0)
    guard.reserve(1.0, task_id="seed")            # clear overage flag
    assert guard.status().stage == STOPPED
    with pytest.raises(BudgetStopped):
        c.complete("hi", task_id="t1", max_tokens=50)
    assert c.provider.usage["calls"] == 0
    assert len(c.provider.script) == 1
    store.close()


def test_local_work_completes_while_stopped(tmp_path):
    """Spec test 8: local tasks still finish under a budget stop."""
    store, guard = make(tmp_path, fixed_monthly_krw=15_000,
                        daily_krw=1e9, task_krw=1e9)
    r = guard.reserve(30_000.0, task_id="seed")
    guard.settle(r, usd=30.0)
    guard.reserve(1.0, task_id="seed")
    store.add_task("local1", "log_tidy")
    task = store.claim("w1")
    store.complete(task, {"tidied": 3})
    assert store.get("local1")["state"] == "succeeded"
    assert guard.max_candidates("high") == 1
    store.close()


def test_daily_report_renders(tmp_path):
    store, guard = make(tmp_path)
    r = guard.reserve(500.0, task_id="t1")
    guard.settle(r, usd=0.4)
    text = guard.daily_report()
    assert "[예산]" in text and "정지선까지" in text
    store.close()


def test_overage_flag_does_not_leak_to_another_task(sg):
    """(b) 재검증 A팔: 439의 마지막 초과가 310의 첫 호출을 거절해
    310 1차 시도가 1스텝에 끝났다. 초과 검토는 초과를 낸 과제에만."""
    store, guard = sg
    res = guard.reserve(100.0, task_id="t1")
    guard.settle(res, usd=0.5)                    # overage on t1
    other = guard.reserve(100.0, task_id="t2")
    assert not isinstance(other, Denied), "다른 과제는 벌하지 않는다"
    again = guard.reserve(100.0, task_id="t1")    # flag already cleared
    assert not isinstance(again, Denied)
