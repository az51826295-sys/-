"""Alpha step A: Task/Run registry guarantees.

Covers spec conditions 1 (registry), 2 (atomic per-unit save),
3 (resume), 5 (concurrent workers), 10 (decision/cost/failure log)
and the storage half of 11 (reboot recovery). The decisive test kills
a worker process with os._exit while it holds a lease and checks that
recovery returns the task exactly once - the failure mode that wiped
the 8.3 lane.
"""

import json
import os
import subprocess
import sys
import textwrap
import threading

import pytest

from genesis.rookery.engine.store import (
    FAILED, LEASED, PENDING, SUCCEEDED, Store, new_worker_id)


@pytest.fixture()
def store(tmp_path):
    s = Store(str(tmp_path / "engine.db"))
    yield s
    s.close()


def test_add_task_is_idempotent(store):
    assert store.add_task("t1", "fix", {"repo": "x"})
    assert not store.add_task("t1", "fix", {"repo": "x"})
    assert store.counts() == {PENDING: 1}


def test_claim_marks_and_returns_payload(store):
    store.add_task("t1", "fix", {"repo": "x"})
    task = store.claim("w1")
    assert task and task.id == "t1" and task.payload == {"repo": "x"}
    assert store.get("t1")["state"] == LEASED
    assert store.claim("w2") is None, "a leased task must not re-claim"


def test_priority_and_order(store):
    store.add_task("low", "fix", priority=0)
    store.add_task("high", "fix", priority=5)
    assert store.claim("w1").id == "high"


def test_kind_filter(store):
    store.add_task("a", "fix")
    store.add_task("b", "report")
    assert store.claim("w1", kinds=["report"]).id == "b"


def test_not_before_defers(store):
    import time

    store.add_task("later", "fix", not_before=time.time() + 300)
    assert store.claim("w1") is None


def test_complete_records_cost_and_event(store):
    store.add_task("t1", "fix")
    task = store.claim("w1")
    store.complete(task, {"pr": 12}, cost_usd=0.03, tokens_in=100,
                   tokens_out=50)
    row = store.get("t1")
    assert row["state"] == SUCCEEDED
    assert json.loads(row["result"]) == {"pr": 12}
    spend = store.spend_since(0)
    assert spend["cost_usd"] == pytest.approx(0.03)
    assert spend["tokens_in"] == 100 and spend["tokens_out"] == 50
    assert any(e["kind"] == "succeeded" for e in store.events())


def test_fail_retries_then_parks(store):
    store.add_task("t1", "fix", max_attempts=2)
    t = store.claim("w1")
    assert store.fail(t, "boom", retry_in=0) == PENDING
    t2 = store.claim("w1")
    assert t2.attempts == 2
    assert store.fail(t2, "boom again", retry_in=0) == FAILED
    assert store.claim("w1") is None
    kinds = {e["kind"] for e in store.events()}
    assert {"failed_retry", "failed_final"} <= kinds


def test_heartbeat_detects_lost_lease(store):
    store.add_task("t1", "fix")
    t = store.claim("w1", lease_s=0.0)
    assert store.recover_orphans() == ["t1"]
    assert not store.heartbeat(t), \
        "a worker whose task was recovered must learn it lost the lease"


def test_recover_orphans_requeues_and_closes_run(store):
    store.add_task("t1", "fix")
    store.claim("w1", lease_s=0.0)
    assert store.recover_orphans() == ["t1"]
    assert store.get("t1")["state"] == PENDING
    again = store.claim("w2")
    assert again and again.attempts == 2
    assert any(e["kind"] == "recovered" for e in store.events())


def test_recover_orphans_fails_when_attempts_exhausted(store):
    store.add_task("t1", "fix", max_attempts=1)
    store.claim("w1", lease_s=0.0)
    store.recover_orphans()
    assert store.get("t1")["state"] == FAILED


def test_live_lease_is_not_recovered(store):
    store.add_task("t1", "fix")
    store.claim("w1", lease_s=600)
    assert store.recover_orphans() == []


def test_concurrent_workers_never_double_claim(tmp_path):
    """Condition 5: several workers, one task each, no duplicates."""
    path = str(tmp_path / "engine.db")
    seed = Store(path)
    for i in range(40):
        seed.add_task(f"t{i}", "fix")
    seed.close()
    claimed: list[str] = []
    lock = threading.Lock()

    def run():
        s = Store(path)
        wid = new_worker_id()
        while True:
            t = s.claim(wid)
            if t is None:
                break
            with lock:
                claimed.append(t.id)
            s.complete(t)
        s.close()

    threads = [threading.Thread(target=run) for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(claimed) == 40
    assert len(set(claimed)) == 40, "a task was claimed twice"


KILL_SCRIPT = textwrap.dedent("""
    import os, sys
    sys.path.insert(0, sys.argv[2])
    from genesis.rookery.engine.store import Store
    s = Store(sys.argv[1])
    t = s.claim("doomed-worker", lease_s=float(sys.argv[3]))
    print("CLAIMED", t.id)
    sys.stdout.flush()
    os._exit(9)          # power-loss model: no cleanup, no commit hook
""")


def test_resume_after_hard_kill(tmp_path):
    path = str(tmp_path / "engine.db")
    script = tmp_path / "kill.py"
    script.write_text(KILL_SCRIPT, encoding="utf-8")
    s = Store(path)
    s.add_task("t1", "fix", {"repo": "x"})
    s.close()

    proc = subprocess.run(
        [sys.executable, str(script), path, os.getcwd(), "0"],
        capture_output=True, text=True, encoding="utf-8",
        errors="replace")
    assert proc.returncode == 9
    assert "CLAIMED t1" in proc.stdout

    s = Store(path)
    assert s.get("t1")["state"] == LEASED, "killed mid-flight"
    assert s.recover_orphans() == ["t1"]
    resumed = s.claim("w2")
    assert resumed.id == "t1" and resumed.attempts == 2
    s.complete(resumed)
    assert s.get("t1")["state"] == SUCCEEDED
    runs = s._conn.execute(
        "SELECT state FROM runs WHERE task_id='t1' ORDER BY id"
    ).fetchall()
    assert [r["state"] for r in runs] == ["orphaned", "succeeded"], \
        "the dead attempt must be closed, not left running"
    s.close()


def test_completed_task_is_never_rerun(tmp_path):
    """Spec success condition 3: 완료된 작업 재실행 0건."""
    path = str(tmp_path / "engine.db")
    s = Store(path)
    s.add_task("t1", "fix")
    s.complete(s.claim("w1"))
    s.close()
    s2 = Store(path)                       # simulated reboot
    assert s2.recover_orphans() == []
    assert s2.claim("w2") is None
    assert not s2.add_task("t1", "fix"), "re-enqueue must be a no-op"
    assert s2.claim("w2") is None
    s2.close()


def test_cancel_is_terminal(store):
    store.add_task("t1", "fix")
    store.cancel("t1", "budget stop")
    assert store.get("t1")["state"] == "cancelled"
    assert store.claim("w1") is None
