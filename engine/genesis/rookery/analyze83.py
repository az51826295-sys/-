"""§8.3 verdict: selector-side IA re-test on the B corpus (3 tasks
x 7 reps). Offline ground truth per candidate (constraint 5), frozen
thresholds rate >= 0.15 / count >= 3.

  python -m genesis.rookery.analyze83
"""

from __future__ import annotations

import json
import os
from collections import Counter

from genesis.rookery.adapters.repo_tasks import run_pytest, worktree_at
from genesis.rookery.exp3a import _reset, apply_blocks, parse_patch, sel_tier
from genesis.rookery.mine import _run
from genesis.rookery.tasks_b4 import build_b4_tasks

DATA = "data"
REPORT = "rookery3a_report_sel83.json"
CALLS = "rookery3a_calls_sel83.jsonl"
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
    responses = _responses()
    tasks = {t.task_id: t for t in build_b4_tasks()}
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
            got_h = run_pytest(wt, task.hidden)[0] if task.hidden \
                else "pass"
            got_r = run_pytest(wt, task.regression)[0]
            got_rh = run_pytest(wt, task.regression_hidden)[0]
            truth = {
                "bad": (got_h != "pass" or got_r != "pass"
                        or got_rh != "pass"),
                "full": (bool(c["public_pass"]) and got_h == "pass"
                         and got_r == "pass" and got_rh == "pass"),
            }
            cache[sig_key] = truth
            out[key] = truth
        _run(["git", "checkout", "--", "."], wt)
    return out


def champion_call(r: dict) -> int | None:
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
    target_runs = 0            # runs where a target candidate exists
    target_cands = target_excluded = 0
    target_champs = champ_n = 0
    ans_runs = ans_picked = 0
    conserv_full = conserv_dropped = 0
    ia_att = mapped_ok = 0
    status = Counter()
    for r in rows:
        cc = champion_call(r)
        has_target = False
        for c in r["candidates"]:
            if c["code_fail"]:
                continue
            key = (arm, r["task"], r["rep"], c["call"])
            t = truth.get(key)
            if c.get("ia_valid") is not None:
                ia_att += 1
                mapped_ok += bool(c["mapped_ids"])
            is_target = bool(c["public_pass"]) and bool(
                t and t["bad"])
            if is_target:
                has_target = True
                target_cands += 1
                target_excluded += c["call"] != cc
            if t and t["full"]:
                conserv_full += 1
                conserv_dropped += c.get("mapped_pass") is False
        target_runs += has_target
        if cc is not None:
            key = (arm, r["task"], r["rep"], cc)
            t = truth.get(key)
            if t is not None:
                champ_n += 1
                ct = next(c for c in r["candidates"]
                          if c["call"] == cc)
                target_champs += bool(ct["public_pass"]) and t["bad"]
        fulls = [c["call"] for c in r["candidates"]
                 if not c["code_fail"]
                 and truth.get((arm, r["task"], r["rep"], c["call"]),
                               {}).get("full")]
        if fulls:
            ans_runs += 1
            ans_picked += cc in fulls
        status[r["final_status"]] += 1
    return {
        "n_runs": len(rows),
        "1_target_run_rate": round(target_runs / n, 2),
        "1_target_runs_abs": target_runs,
        "2_target_excluded": f"{target_excluded}/{target_cands}",
        "3_answer_pick": f"{ans_picked}/{ans_runs}",
        "4_target_champion_rate": round(
            target_champs / (champ_n or 1), 3),
        "4_target_champions_abs": f"{target_champs}/{champ_n}",
        "5_over_conservatism": round(
            conserv_dropped / (conserv_full or 1), 2)
        if conserv_full else None,
        "full_rate": round(status["full"] / n, 2),
        "mapping_success": round(mapped_ok / ia_att, 2)
        if ia_att else None,
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
    print(f"{'지표':26s} {'B-public':>14s} {'B-sel-IA':>14s}")
    for k in out["BPUB"]:
        print(f"{k:26s} {str(out['BPUB'][k]):>14s} "
              f"{str(out['BSEL'][k]):>14s}")
    d = abs(out["BPUB"]["4_target_champion_rate"]
            - out["BSEL"]["4_target_champion_rate"])
    zero = (out["BPUB"]["1_target_runs_abs"]
            + out["BSEL"]["1_target_runs_abs"]) == 0
    print()
    if zero:
        print("등록 분기: 표적 후보 자발 생성 0 — 검정 불가, "
              "'모델이 부분 수정을 자발 생성하지 않는다'로 기록")
    else:
        print(f"④ 표적 champion 채택률 차이 {d:.3f} -> "
              + ("발동" if d >= MIN_RATE else "유보 (문턱 0.15)"))
    per_task = {}
    for r in rows:
        per_task.setdefault(r["task"], {}).setdefault(
            r["arm"], Counter())[r["final_status"]] += 1
    print("\n과제별:")
    for task, arms in sorted(per_task.items()):
        print(f"  {task}: " + " | ".join(
            f"{a} {dict(c)}" for a, c in sorted(arms.items())))
    with open(os.path.join(DATA, "rookery3a_verdict83.json"), "w",
              encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
