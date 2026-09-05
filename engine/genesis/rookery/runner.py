"""Common resumable runner for Rookery A/B experiments.

Every micro-experiment (§6.10 onward) is the same shape: for each
task, for each repetition, for each arm, execute one run and record
one row. This wraps that loop with RunLog so a killed process
continues instead of restarting - the §8.3 lesson.

  summary = run_experiment_resumable(
      experiment="sel83",
      arms={"BPUB": pub_fn, "BSEL": sel_fn},   # fn(task, rep, log)
      tasks=tasks, reps=7,
      config={"model": ..., "temperature": 1.0, ...},
      summarize=lambda rows, tasks: {...})
"""

from __future__ import annotations

import json
import os
from typing import Any, Callable

from genesis.rookery.runlog import RunLog

DATA = "data"


def run_experiment_resumable(
    experiment: str,
    arms: dict[str, Callable],
    tasks: list,
    reps: int,
    config: dict[str, Any],
    summarize: Callable[[list[dict], list], dict] | None = None,
    usage_of: Callable[[], dict] | None = None,
    log_prefix: str = "",
) -> dict:
    """Runs every (task, rep, arm) not already recorded, in a stable
    order. Returns the summary dict and writes the report."""
    state_path = os.path.join(DATA, f"rookery3a_runlog_{experiment}.json")
    calls_path = os.path.join(DATA, f"rookery3a_calls_{experiment}.jsonl")
    report_path = os.path.join(DATA,
                               f"rookery3a_report_{experiment}.json")
    if os.path.exists(report_path) and not os.path.exists(state_path):
        # A finished pre-resume experiment (e.g. sel83) has a report
        # but no run log. Re-running would rotate its call log and
        # overwrite its report; archived results are not scratch.
        raise SystemExit(
            f"refusing to run {experiment!r}: a completed report "
            f"exists at {report_path} with no run log (pre-resume "
            f"experiment). Archive it or use a new experiment tag.")
    runlog = RunLog(state_path, experiment, config, calls_path)
    if runlog.completed():
        print(f"[{experiment}] 재개: 완료 {runlog.completed()}런 스킵 "
              f"(attempt {runlog.state.attempts})", flush=True)

    for task in tasks:
        task_id = getattr(task, "task_id", str(task))
        for rep in range(reps):
            for arm, fn in arms.items():
                if runlog.done(arm, task_id, rep):
                    continue
                row = fn(task, rep, runlog.log_call)
                if hasattr(row, "model_dump"):
                    row = row.model_dump()
                runlog.record(arm, task_id, rep, row)
                print(f"[{log_prefix or experiment}] {task_id} {arm} "
                      f"rep{rep}: {row.get('final_status')}", flush=True)

    rows = runlog.rows()
    summary = summarize(rows, tasks) if summarize else {}
    if usage_of:
        summary["usage"] = usage_of()
    summary["_runlog"] = {"attempts": runlog.state.attempts,
                          "completed": runlog.completed(),
                          "call_logs": runlog.all_call_logs()}
    with open(os.path.join(DATA, f"rookery3a_report_{experiment}.json"),
              "w", encoding="utf-8") as f:
        json.dump({"results": rows, "summary": summary}, f,
                  ensure_ascii=False, indent=1)
    return summary
