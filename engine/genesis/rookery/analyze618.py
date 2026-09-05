"""§6.18 verdict: location metrics only (patch quality is context).

Confirmatory data: rookery3a_{calls,report}_loc618 (fresh 60 runs).
Exploratory (registered as such): the same metrics recomputed on the
§6.14 arms (ia614) — reported separately, never pooled.

  python -m genesis.rookery.analyze618            # confirmatory
  python -m genesis.rookery.analyze618 --retro    # + 6.14 exploratory
"""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter

from genesis.rookery.adapters.repo_tasks import TASKS_V3A
from genesis.rookery.analyze614 import ANSWER_FUNCS
from genesis.rookery.exp3a import parse_patch

DATA = "data"
MIN_RATE, MIN_COUNT = 0.15, 3


def _blocks_by_call(calls_name: str, arm: str) -> dict[tuple, set]:
    tasks = {t.task_id: t for t in TASKS_V3A}
    out = {}
    with open(os.path.join(DATA, calls_name), encoding="utf-8") as f:
        for line in f:
            e = json.loads(line)
            if (e.get("arm") == arm and "candidate" in e
                    and "response" in e):
                blocks = parse_patch(e["response"], tasks[e["task"]])
                out[(e["task"], e["rep"], e["call"])] = {
                    (b.file, b.name) for b in (blocks or [])}
    return out


def arm_metrics(tag: str, arm: str) -> dict:
    rows = [r for r in json.load(open(
        os.path.join(DATA, f"rookery3a_report_{tag}.json"),
        encoding="utf-8"))["results"] if r["arm"] == arm]
    touched = _blocks_by_call(f"rookery3a_calls_{tag}.jsonl", arm)
    n = len(rows) or 1
    applied = file_hit = func_hit = 0
    first_file = first_func = first_n = 0
    first_ok_correct = first_ok_n = 0
    cands_to_func: list[int] = []
    pub_smoke = 0
    status = Counter()
    for r in rows:
        status[r["final_status"]] += 1
        answer_files = {f for f, _ in ANSWER_FUNCS[r["task"]]}
        seen_applied = 0
        got_func_at = None
        first_seen = False
        first_ok_seen = False
        for c in r["candidates"]:
            if c["code_fail"]:
                continue
            applied += 1
            seen_applied += 1
            locs = touched.get((r["task"], r["rep"], c["call"]), set())
            hit_file = bool({f for f, _ in locs} & answer_files)
            hit_func = bool(locs & ANSWER_FUNCS[r["task"]])
            file_hit += hit_file
            func_hit += hit_func
            if hit_func and got_func_at is None:
                got_func_at = seen_applied
            if not first_seen:
                first_seen = True
                first_n += 1
                first_file += hit_file
                first_func += hit_func
            if c["public_pass"]:
                pub_smoke += 1
                if not first_ok_seen:
                    first_ok_seen = True
                    first_ok_n += 1
                    first_ok_correct += hit_func
        if got_func_at is not None:
            cands_to_func.append(got_func_at)
    a = applied or 1
    return {
        "n_runs": len(rows),
        "applied": applied,
        "1_file_hit_rate": round(file_hit / a, 3),
        "2_func_hit_rate": round(func_hit / a, 3),
        "2_func_hit_abs": func_hit,
        "3_first_patch_file": round(first_file / (first_n or 1), 2),
        "3_first_patch_func": round(first_func / (first_n or 1), 2),
        "4_first_ok_correct_loc": f"{first_ok_correct}/{first_ok_n}",
        "4_cands_to_func_mean": round(
            sum(cands_to_func) / len(cands_to_func), 2)
        if cands_to_func else None,
        "4_runs_reaching_func": len(cands_to_func),
        "5_pub_smoke_cands": pub_smoke,
        "ctx_status": dict(sorted(status.items())),
    }


def show(tag: str, label: str) -> None:
    out = {arm: arm_metrics(tag, arm) for arm in ("BIA", "BPAD")}
    print(f"=== {label}")
    print(f"{'지표':26s} {'B-IA':>12s} {'B-pad':>12s}")
    for k in out["BIA"]:
        print(f"{k:26s} {str(out['BIA'][k]):>12s} "
              f"{str(out['BPAD'][k]):>12s}")
    ia, pad = out["BIA"], out["BPAD"]
    checks = [
        ("① 파일 적중률", ia["1_file_hit_rate"],
         pad["1_file_hit_rate"], "rate"),
        ("② 함수 적중률", ia["2_func_hit_rate"],
         pad["2_func_hit_rate"], "rate"),
        ("③ 최초 패치 함수 적중", ia["3_first_patch_func"],
         pad["3_first_patch_func"], "rate"),
        ("⑤ 공개+스모크 통과 후보", ia["5_pub_smoke_cands"],
         pad["5_pub_smoke_cands"], "count"),
    ]
    print("문턱 판정 (rate 0.15 / count 3):")
    for name, a, b, kind in checks:
        d = abs(a - b)
        fire = d >= (MIN_RATE if kind == "rate" else MIN_COUNT)
        lead = "B-IA" if a > b else "B-pad"
        print(f"  {name}: "
              + (f"발동 ({lead} 우위, 차 {d:.3f})" if fire
                 else f"유보 (차 {d:.3f})"))
    if tag == "loc618":
        with open(os.path.join(DATA, "rookery3a_verdict618.json"),
                  "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--retro", action="store_true")
    args = parser.parse_args()
    show("loc618", "§6.18 확증 (신규 60런)")
    if args.retro:
        print()
        show("ia614", "§6.14 회고 (탐색 지표 — 확증과 통합 금지)")


if __name__ == "__main__":
    main()
