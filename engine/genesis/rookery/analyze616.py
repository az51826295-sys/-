"""§6.16 verdict: B-public vs B-selector-IA.

Offline ground-truth pass (frozen constraint 6): after the experiment
ends, every logged candidate patch is re-applied to a clean worktree
and the validator-only suites (hidden + regression + regression_
hidden) are run per candidate. This never fed back into selection.

Champion reconstruction replays the frozen adopt rule (tier-based)
over the recorded candidate order — deterministic, identical to the
runtime logic.

  python -m genesis.rookery.analyze616
"""

from __future__ import annotations

import json
import os
from collections import Counter

from genesis.rookery.adapters.repo_tasks import (
    TASKS_V3A, _run, run_pytest, worktree_at)
from genesis.rookery.exp3a import (
    _reset, apply_blocks, parse_patch, sel_tier)

DATA = "data"
REPORT = "rookery3a_report_sel616.json"
CALLS = "rookery3a_calls_sel616.jsonl"
MIN_RATE, MIN_COUNT = 0.15, 3


def _responses() -> dict[tuple, str]:
    out = {}
    with open(os.path.join(DATA, CALLS), encoding="utf-8") as f:
        for line in f:
            e = json.loads(line)
            if "candidate" in e and "response" in e:
                out[(e["arm"], e["task"], e["rep"],
                     e["call"])] = e["response"]
    return out


def offline_truth(rows: list[dict]) -> dict[tuple, dict]:
    """(arm, task, rep, call) -> {"regression": bool, "full": bool}
    for every applied candidate; identical patches (by sig) share one
    evaluation."""
    responses = _responses()
    tasks = {t.task_id: t for t in TASKS_V3A}
    cache: dict[tuple, dict] = {}
    out = {}
    for r in rows:
        task = tasks[r["task"]]
        wt = worktree_at(task, task.parent_commit, "work")
        for c in r["candidates"]:
            if c["code_fail"]:
                continue
            key = (r["arm"], r["task"], r["rep"], c["call"])
            sig_key = (r["task"], c["sig"])
            if sig_key in cache:
                out[key] = cache[sig_key]
                continue
            resp = responses.get(key)
            blocks = parse_patch(resp, task) if resp else None
            if not blocks:
                continue
            _reset(wt, task)
            if apply_blocks(wt, task, blocks) is not None:
                continue
            got_h, _ = run_pytest(wt, task.hidden)
            got_r, _ = run_pytest(wt, task.regression)
            got_rh, _ = run_pytest(wt, task.regression_hidden)
            truth = {
                "regression": got_r != "pass" or got_rh != "pass",
                "full": (bool(c["public_pass"]) and got_h == "pass"
                         and got_r == "pass" and got_rh == "pass"),
            }
            cache[sig_key] = truth
            out[key] = truth
        _run(["git", "checkout", "--", "."], wt)
    return out


def champion_call(r: dict) -> int | None:
    """Replay the frozen adopt rule; returns the champion's call."""
    champ, tier0 = None, -1
    for c in r["candidates"]:
        if c["code_fail"]:
            continue
        tier = sel_tier(bool(c["public_pass"]), c.get("mapped_pass"))
        if champ is None or tier > tier0:
            champ, tier0 = c["call"], tier
    return champ


def arm_metrics(rows: list[dict], arm: str,
                truth: dict[tuple, dict]) -> dict:
    rows = [r for r in rows if r["arm"] == arm]
    n = len(rows) or 1
    champ_reg = champ_n = 0
    ia_att = mapped_ok = 0
    dir_hits = dir_base = 0
    pub_cands = sel_dropped = 0
    ans_runs = ans_picked = 0
    conserv_full = conserv_dropped = 0
    for r in rows:
        cc = champion_call(r)
        for c in r["candidates"]:
            if c["code_fail"]:
                continue
            key = (arm, r["task"], r["rep"], c["call"])
            t = truth.get(key)
            if c.get("ia_valid") is not None:
                ia_att += 1
                mapped_ok += bool(c["mapped_ids"])
            if c["public_pass"]:
                pub_cands += 1
                if c.get("mapped_pass") is False:
                    sel_dropped += 1
            if t and t["regression"] and c["mapped_ids"]:
                dir_base += 1
                dir_hits += c.get("mapped_pass") is False
            if t and t["full"]:
                conserv_full += 1
                conserv_dropped += c.get("mapped_pass") is False
        if cc is not None:
            key = (arm, r["task"], r["rep"], cc)
            t = truth.get(key)
            if t is not None:
                champ_n += 1
                champ_reg += t["regression"]
        run_full_keys = [c["call"] for c in r["candidates"]
                         if not c["code_fail"]
                         and truth.get((arm, r["task"], r["rep"],
                                        c["call"]), {}).get("full")]
        if run_full_keys:
            ans_runs += 1
            ans_picked += cc in run_full_keys
    status = Counter(r["final_status"] for r in rows)
    return {
        "n_runs": len(rows),
        "champion_regression_rate": round(champ_reg / (champ_n or 1), 3),
        "champion_regression_abs": f"{champ_reg}/{champ_n}",
        "mapping_success_rate": round(mapped_ok / ia_att, 2)
        if ia_att else None,
        "direction_capture_rate": round(dir_hits / dir_base, 2)
        if dir_base else None,
        "direction_base": dir_base,
        "sel_drop_rate_of_public": round(
            sel_dropped / (pub_cands or 1), 2),
        "public_cands": pub_cands,
        "answer_runs": ans_runs,
        "answer_picked": ans_picked,
        "over_conservatism": round(
            conserv_dropped / (conserv_full or 1), 2)
        if conserv_full else None,
        "full_rate": round(status["full"] / n, 2),
        "status": dict(sorted(status.items())),
        "mean_test_runs": round(sum(
            r["test_runs"] for r in rows) / n, 1),
        "mean_wall_s": round(sum(r["wall_s"] for r in rows) / n, 1),
    }


def main() -> None:
    rows = json.load(open(os.path.join(DATA, REPORT),
                          encoding="utf-8"))["results"]
    truth = offline_truth(rows)
    out = {arm: arm_metrics(rows, arm, truth)
           for arm in ("BPUB", "BSEL")}
    print(f"{'지표':28s} {'B-public':>12s} {'B-sel-IA':>12s}")
    for k in out["BPUB"]:
        print(f"{k:28s} {str(out['BPUB'][k]):>12s} "
              f"{str(out['BSEL'][k]):>12s}")
    d = abs(out["BPUB"]["champion_regression_rate"]
            - out["BSEL"]["champion_regression_rate"])
    print(f"\n① champion 회귀율 차이 {d:.3f} -> "
          + ("발동" if d >= MIN_RATE else "유보 (문턱 0.15)"))
    per_task = {}
    for r in rows:
        per_task.setdefault(r["task"], {}).setdefault(
            r["arm"], Counter())[r["final_status"]] += 1
    print("\n과제별:")
    for task, arms in sorted(per_task.items()):
        print(f"  {task}: " + " | ".join(
            f"{a} {dict(c)}" for a, c in sorted(arms.items())))
    with open(os.path.join(DATA, "rookery3a_verdict616.json"), "w",
              encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
