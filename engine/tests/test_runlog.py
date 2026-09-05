"""Resume self-verification for the Rookery common runner.

Gate (user directive 2026-08-02): no 40+ run experiment starts until
these pass. The decisive test kills a child process mid-experiment
with os._exit (no cleanup, no flush) and checks that the resumed run
completes the set exactly once.
"""

import json
import os
import subprocess
import sys
import textwrap

import pytest

from genesis.rookery.runlog import RunLog, run_key


@pytest.fixture()
def paths(tmp_path):
    return (str(tmp_path / "state.json"), str(tmp_path / "calls.jsonl"))


def test_unique_key_and_skip(paths):
    state, calls = paths
    log = RunLog(state, "exp", {"model": "m"}, calls)
    assert not log.done("A", "t1", 0)
    log.record("A", "t1", 0, {"final_status": "full"})
    assert log.done("A", "t1", 0)
    # same task/rep, different arm -> distinct key
    assert not log.done("B", "t1", 0)
    assert not log.done("A", "t1", 1)
    assert run_key("A", "t1", 0) != run_key("B", "t1", 0)


def test_config_drift_refused(paths):
    state, calls = paths
    RunLog(state, "exp", {"model": "haiku", "temperature": 1.0}, calls)
    with pytest.raises(ValueError, match="changed call settings"):
        RunLog(state, "exp", {"model": "haiku", "temperature": 0.3},
               calls)


def test_wrong_experiment_refused(paths):
    state, calls = paths
    RunLog(state, "exp_a", {}, calls)
    with pytest.raises(ValueError, match="belongs to"):
        RunLog(state, "exp_b", {}, calls)


def test_seed_is_stable_and_key_specific(paths):
    state, calls = paths
    log = RunLog(state, "exp", {"master_seed": 7}, calls)
    s1 = log.seed_for("A", "t1", 0)
    log2 = RunLog(state, "exp", {"master_seed": 7}, calls)
    assert log2.seed_for("A", "t1", 0) == s1          # survives restart
    assert log2.seed_for("A", "t1", 1) != s1          # key-specific
    assert log2.seed_for("B", "t1", 0) != s1


def test_call_log_rotation_preserves_and_separates(paths):
    state, calls = paths
    log = RunLog(state, "exp", {}, calls)
    log.log_call({"attempt": 1, "x": 1})
    log.record("A", "t1", 0, {"final_status": "full"})
    log2 = RunLog(state, "exp", {}, calls)            # restart
    log2.log_call({"attempt": 2, "x": 2})
    kept = calls + ".attempt1"
    assert os.path.exists(kept), "interrupted log must be preserved"
    assert json.loads(open(kept, encoding="utf-8").read())["attempt"] == 1
    fresh = [json.loads(l) for l in open(calls, encoding="utf-8")]
    assert [e["attempt"] for e in fresh] == [2], "logs must not mix"
    assert set(log2.all_call_logs()) == {kept, calls}


def test_atomic_state_never_torn(paths):
    """Every save must land whole: the file parses after each write."""
    state, calls = paths
    log = RunLog(state, "exp", {}, calls)
    for i in range(20):
        log.record("A", f"t{i}", 0, {"final_status": "full"})
        with open(state, encoding="utf-8") as f:
            json.load(f)                       # raises if torn
    assert not os.path.exists(state + ".tmp")


def test_refuses_to_clobber_pre_resume_report(tmp_path, monkeypatch):
    """A finished pre-resume experiment has a report but no run log;
    re-running must not rotate its calls and overwrite its report."""
    import genesis.rookery.runner as R

    monkeypatch.setattr(R, "DATA", str(tmp_path))
    (tmp_path / "rookery3a_report_old.json").write_text(
        '{"results": []}', encoding="utf-8")
    with pytest.raises(SystemExit, match="completed report"):
        R.run_experiment_resumable(
            experiment="old", arms={"A": lambda t, r, log: {}},
            tasks=["t"], reps=1, config={})


KILL_SCRIPT = textwrap.dedent("""
    import os, sys
    sys.path.insert(0, sys.argv[3])
    from genesis.rookery.runner import run_experiment_resumable
    import genesis.rookery.runner as R
    R.DATA = sys.argv[1]
    kill_after = int(sys.argv[2])
    seen = []

    def make(arm):
        def fn(task, rep, log):
            log({"arm": arm, "task": task, "rep": rep})
            seen.append(1)
            if len(seen) == kill_after:
                os._exit(9)          # hard kill: no flush, no cleanup
            return {"final_status": "full", "marker": arm}
        return fn

    run_experiment_resumable(
        experiment="killtest",
        arms={"A": make("A"), "B": make("B")},
        tasks=["t1", "t2", "t3"], reps=2,
        config={"model": "mock"},
        summarize=lambda rows, tasks: {"n": len(rows)})
    print("COMPLETED", len(seen))
""")


def test_resume_after_hard_kill(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    script = tmp_path / "kill.py"
    script.write_text(KILL_SCRIPT, encoding="utf-8")
    root = os.getcwd()

    first = subprocess.run(
        [sys.executable, str(script), str(data), "5", root],
        capture_output=True, text=True, encoding="utf-8",
        errors="replace")
    assert first.returncode == 9, first.stderr[-500:]

    state_path = data / "rookery3a_runlog_killtest.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    assert len(state["runs"]) == 4, "4 runs completed before the kill"

    second = subprocess.run(
        [sys.executable, str(script), str(data), "999", root],
        capture_output=True, text=True, encoding="utf-8",
        errors="replace")
    assert second.returncode == 0, second.stderr[-500:]
    # 12 total runs, 4 already done -> the resumed process executes 8
    assert "COMPLETED 8" in second.stdout, second.stdout

    report = json.loads(
        (data / "rookery3a_report_killtest.json").read_text(
            encoding="utf-8"))
    rows = report["results"]
    assert len(rows) == 12
    keys = {(r["arm"], r["task"], r["rep"]) for r in rows}
    assert len(keys) == 12, "no duplicate runs after resume"
    assert report["summary"]["_runlog"]["attempts"] == 2
    # the interrupted attempt's calls are preserved, not mixed in
    kept = data / "rookery3a_calls_killtest.jsonl.attempt1"
    assert kept.exists()
    assert len(kept.read_text(encoding="utf-8").splitlines()) == 5
    fresh = data / "rookery3a_calls_killtest.jsonl"
    assert len(fresh.read_text(encoding="utf-8").splitlines()) == 8
