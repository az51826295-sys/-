"""§6.14 verdict: B-IA vs B-pad (BS v2 as champion-level context).

Frozen metrics (design §6.14): regression-candidate rate, public+
smoke passing candidates, answer-function touch rate, champion-level
partial-fix rate; guard = answer-file inclusion. Minimum effect
sizes: rate diff >= 0.15 OR count diff >= 3, else the metric is
recorded as withheld (교훈: §6.13's missing thresholds).

  python -m genesis.rookery.analyze614
"""

from __future__ import annotations

import json
import os
from collections import Counter, defaultdict

from genesis.rookery.adapters.repo_tasks import TASKS_V3A
from genesis.rookery.exp3a import parse_patch

DATA = "data"
REPORT = "rookery3a_report_ia614.json"
CALLS = "rookery3a_calls_ia614.jsonl"

ANSWER_FUNCS = {          # frozen in the registration, 2026-08-02
    "mi_running_minmax_stability": {
        ("more_itertools/recipes.py", "_windowed_running_max"),
        ("more_itertools/recipes.py", "_windowed_running_min")},
    "du_isotime_midnight": {
        ("dateutil/parser/isoparser.py", "parse_isotime")},
    "du_isoparse_t24_rollover": {
        ("dateutil/parser/isoparser.py", "_parse_isotime"),
        ("dateutil/parser/isoparser.py", "isoparse"),
        ("dateutil/parser/isoparser.py", "parse_isotime")},
}
MIN_RATE, MIN_COUNT = 0.15, 3


def _blocks_by_call(arm: str) -> dict[tuple, set]:
    """(task, rep, call) -> {(file, func)} parsed from logged patch
    responses, same parser as the runtime."""
    tasks = {t.task_id: t for t in TASKS_V3A}
    out = {}
    with open(os.path.join(DATA, CALLS), encoding="utf-8") as f:
        for line in f:
            e = json.loads(line)
            if (e.get("arm") == arm and "candidate" in e
                    and "response" in e):
                blocks = parse_patch(e["response"], tasks[e["task"]])
                out[(e["task"], e["rep"], e["call"])] = {
                    (b.file, b.name) for b in (blocks or [])}
    return out


def arm_metrics(rows: list[dict], arm: str) -> dict:
    rows = [r for r in rows if r["arm"] == arm]
    touched = _blocks_by_call(arm)
    n = len(rows) or 1
    applied = smoke_fail = pub_smoke = func_hit = 0
    file_hit_runs = 0
    ia_valid = ia_attempted = 0
    ia_lens = []
    for r in rows:
        answer_files = {f for f, _ in ANSWER_FUNCS[r["task"]]}
        run_files = set()
        for c in r["candidates"]:
            if c.get("ia_valid") is not None:
                ia_attempted += 1
                ia_valid += bool(c["ia_valid"])
                if c["ia_len"]:
                    ia_lens.append(c["ia_len"])
            if c["code_fail"]:
                continue
            applied += 1
            run_files |= set(c["files"])
            if c.get("smoke_pass") is False:
                smoke_fail += 1
            if c["public_pass"]:
                pub_smoke += 1
            key = (r["task"], r["rep"], c["call"])
            if touched.get(key, set()) & ANSWER_FUNCS[r["task"]]:
                func_hit += 1
        file_hit_runs += bool(run_files & answer_files)
    a = applied or 1
    status = Counter(r["final_status"] for r in rows)
    return {
        "n_runs": len(rows),
        "applied_cands": applied,
        "regression_cand_rate": round(smoke_fail / a, 3),
        "regression_cand_abs": smoke_fail,
        "public_smoke_cands": pub_smoke,
        "answer_func_rate": round(func_hit / a, 3),
        "answer_func_abs": func_hit,
        "partial_fix_rate": round(status["public_only"] / n, 2),
        "full": status["full"],
        "status": dict(sorted(status.items())),
        "guard_answer_file_rate": round(file_hit_runs / n, 2),
        "ia_valid_rate": round(ia_valid / ia_attempted, 2)
        if ia_attempted else None,
        "ia_len_mean": round(sum(ia_lens) / len(ia_lens))
        if ia_lens else None,
    }


def _sig(label: str, kind: str, a, b) -> str:
    diff = abs(a - b)
    ok = diff >= (MIN_RATE if kind == "rate" else MIN_COUNT)
    lead = "BIA" if (a > b) else "BPAD"
    if kind in ("rate_low", "count_low"):    # lower is better
        lead = "BIA" if (a < b) else "BPAD"
        ok = diff >= (MIN_RATE if kind == "rate_low" else MIN_COUNT)
    return (f"{label}: {'발동(' + lead + ' 우위)' if ok else '유보'}"
            f" (차이 {diff:.3f})")


def main() -> None:
    rows = json.load(open(os.path.join(DATA, REPORT),
                          encoding="utf-8"))["results"]
    out = {arm: arm_metrics(rows, arm) for arm in ("BIA", "BPAD")}
    print(f"{'지표':26s} {'B-IA':>10s} {'B-pad':>10s}")
    for k in out["BIA"]:
        print(f"{k:26s} {str(out['BIA'][k]):>10s} "
              f"{str(out['BPAD'][k]):>10s}")
    ia, pad = out["BIA"], out["BPAD"]
    print("\n최소 효과 크기 판정 (rate ≥ 0.15 / count ≥ 3):")
    print(" ", _sig("① 회귀 후보 비율(낮을수록 우위)", "rate_low",
                    ia["regression_cand_rate"],
                    pad["regression_cand_rate"]))
    print(" ", _sig("② 공개+스모크 통과 후보 수", "count",
                    ia["public_smoke_cands"], pad["public_smoke_cands"]))
    print(" ", _sig("③ 관련 함수 포함률", "rate",
                    ia["answer_func_rate"], pad["answer_func_rate"]))
    print(" ", _sig("④ 부분 수정률(champion)", "rate",
                    ia["partial_fix_rate"], pad["partial_fix_rate"]))
    per_task = defaultdict(lambda: defaultdict(Counter))
    for r in rows:
        per_task[r["task"]][r["arm"]][r["final_status"]] += 1
    print("\n과제별 (사전 예측 대조):")
    for task, arms in sorted(per_task.items()):
        print(f"  {task}: "
              + " | ".join(f"{a} {dict(c)}"
                           for a, c in sorted(arms.items())))
    with open(os.path.join(DATA, "rookery3a_verdict614.json"), "w",
              encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
