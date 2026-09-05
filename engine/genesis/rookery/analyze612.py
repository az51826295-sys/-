"""§6.12 verdict: BS (v2, reused) vs BSN (registry ablated).

Both arms are scored with one formula set, from the run reports plus
the per-round call logs. Symbol validation (metric 4) is re-resolved
against a clean worktree for both arms, because the v2 BS logs
predate the per-hypothesis validation field.

Frozen primary metrics (design §6.12):
1. verified-wrong-location revisit rate — hypotheses in round 2 that
   name a location refuted by the end of round 1, over round-2
   hypotheses (matching rule identical to the runtime ban check:
   "file::function" substring against recorded negative entries).
2. distinct files per run (hypothesis level and candidate level)
3. correct-file inclusion rate (both levels)
4. mechanical validation pass rate = symbol-resolving hypotheses /
   generated
5. public+smoke passing candidates per run
Secondary: full-solve rate, no_patch rate.

  python -m genesis.rookery.analyze612
"""

from __future__ import annotations

import json
import os
from collections import defaultdict

from genesis.rookery.adapters.repo_tasks import TASKS_V3A, _run, worktree_at
from genesis.rookery.exp3a import RESISTANT, _resolve_symbol

DATA = "data"
ARMS = {
    "BS": ("rookery3a_report_bsearch.json",
           "rookery3a_calls_bsearch.jsonl"),
    "BSN": ("rookery3a_report_bsearch_noreg.json",
            "rookery3a_calls_bsearch_noreg.jsonl"),
}


def _load(name: str):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def _rounds(calls_name: str, arm: str) -> list[dict]:
    out = []
    path = os.path.join(DATA, calls_name)
    with open(path, encoding="utf-8") as f:
        for line in f:
            e = json.loads(line)
            if e.get("arm") == arm and "round" in e:
                out.append(e)
    return out


def _clean_worktrees() -> dict[str, str]:
    wts = {}
    for t in TASKS_V3A:
        if t.task_id in RESISTANT:
            wt = worktree_at(t, t.parent_commit, "work")
            _run(["git", "checkout", "--", "."], wt)
            wts[t.task_id] = wt
    return wts


def arm_metrics(arm: str) -> dict:
    report_name, calls_name = ARMS[arm]
    rows = [r for r in _load(report_name)["results"]
            if r["arm"] == arm]
    rounds = _rounds(calls_name, arm)
    wts = _clean_worktrees()

    by_run = defaultdict(list)
    for e in rounds:
        by_run[(e["task"], e["rep"])].append(e)

    r2_hyps = r2_revisits = 0
    gen_total = resolve_pass = 0
    hyp_files_per_run = []
    hyp_correct_runs = 0
    for (task_id, rep), es in by_run.items():
        es.sort(key=lambda e: e["round"])
        answer = next(set(t.files_changed) for t in TASKS_V3A
                      if t.task_id == task_id)
        files = set()
        correct = False
        for e in es:
            for h in e["hypotheses"]:
                gen_total += 1
                if _resolve_symbol(wts[task_id], h["file"],
                                   h["function"]) is not None:
                    resolve_pass += 1
            for h in e["chosen"]:
                files.add(h["file"])
                if h["file"] in answer:
                    correct = True
            if e["round"] >= 1:
                prev_neg = es[e["round"] - 1]["negative"]
                for h in e["hypotheses"]:
                    r2_hyps += 1
                    key = f"{h['file']}::{h['function']}"
                    if any(key in n for n in prev_neg):
                        r2_revisits += 1
        hyp_files_per_run.append(len(files))
        hyp_correct_runs += correct

    n = len(rows) or 1
    cand_files = []
    cand_correct = pub_cands = 0
    for r in rows:
        answer = next(set(t.files_changed) for t in TASKS_V3A
                      if t.task_id == r["task"])
        cands = [c for c in r["candidates"] if not c["code_fail"]]
        files = {f for c in cands for f in c["files"]}
        cand_files.append(len(files))
        cand_correct += bool(files & answer)
        pub_cands += sum(c["public_pass"] for c in cands)
    nr = len(by_run) or 1
    return {
        "n_runs": len(rows),
        "revisit_rate_r2": round(r2_revisits / (r2_hyps or 1), 3),
        "revisits_abs": r2_revisits,
        "r2_hyps": r2_hyps,
        "hyp_distinct_files_mean": round(
            sum(hyp_files_per_run) / nr, 2),
        "cand_distinct_files_mean": round(
            sum(cand_files) / n, 2),
        "hyp_correct_file_rate": round(hyp_correct_runs / nr, 2),
        "cand_correct_file_rate": round(cand_correct / n, 2),
        "validation_pass_rate": round(
            resolve_pass / (gen_total or 1), 3),
        "hyp_generated": gen_total,
        "public_smoke_cands_per_run": round(pub_cands / n, 2),
        "public_smoke_cands_abs": pub_cands,
        "full_rate": round(sum(
            r["final_status"] == "full" for r in rows) / n, 2),
        "no_patch_rate": round(sum(
            r["final_status"] == "no_patch" for r in rows) / n, 2),
        "status_counts": dict(sorted(
            (s, sum(r["final_status"] == s for r in rows))
            for s in {r["final_status"] for r in rows})),
    }


def main() -> None:
    out = {arm: arm_metrics(arm) for arm in ARMS}
    keys = list(next(iter(out.values())).keys())
    print(f"{'지표':32s} {'BS':>12s} {'BSN':>12s}")
    for k in keys:
        a, b = out["BS"][k], out["BSN"][k]
        print(f"{k:32s} {str(a):>12s} {str(b):>12s}")
    with open(os.path.join(DATA, "rookery3a_verdict612.json"), "w",
              encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
