"""다양성 판정의 검정력 — 몇 번 더 불러야 판정이 서나 (지출 0).

관측된 호출별 새것 비율을 **재표본**해서, 호출 수 N일 때 판정(flat/saturating)이
설 확률을 시뮬레이션한다. 문턱(0.80·0.50)은 건드리지 않는다 — 이건 계획 도구지
판정 도구가 아니다.

  python -X utf8 tools/diversity_power.py --run data/diversity_run_v1_run2.json ...
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from tools import diversity_by_concept as dbc            # noqa: E402

TRIALS = 150        # 계획 도구라 정밀도보다 속도가 낫다
CALL_GRID = (10, 20, 30, 50, 80)
SEED = 12345
USD_PER_CALL = 0.0064          # 오늘 밤 실측(67호출 $0.431)


def _ci(values: list, rng, n_boot: int = 500) -> tuple:
    k = len(values)
    means = sorted(sum(values[rng.randrange(k)] for _ in range(k)) / k
                   for _ in range(n_boot))
    return (means[int(0.025 * (n_boot - 1))], means[int(0.975 * (n_boot - 1))])


def power_for(values: list, n_calls: int, rng) -> dict:
    """호출 n_calls개로 늘렸을 때 판정이 설 확률(관측 분포에서 재표본)."""
    decided = flat = sat = 0
    for _ in range(TRIALS):
        draw = [values[rng.randrange(len(values))] for _ in range(n_calls - 1)]
        lo, hi = _ci(draw, rng)
        if lo >= dbc.FLAT_LOWER:
            decided += 1
            flat += 1
        elif hi <= dbc.SATURATING_UPPER:
            decided += 1
            sat += 1
    return {"calls": n_calls, "decided": decided / TRIALS,
            "flat": flat / TRIALS, "saturating": sat / TRIALS}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--run", action="append", required=True)
    ap.add_argument("--out", default="data/diversity_power_v0.json")
    a = ap.parse_args(argv)
    runs = dbc.load_runs(a.run)
    res = dbc.analyse(runs)
    tier = res["tier_used"]
    if tier is None:
        print("분해능 있는 층위가 없다 — 검정력을 계산할 대상이 없다")
        return 0
    rng = random.Random(SEED)
    out = {"spec": "diversity-power-v0", "tier": tier,
           "note": "계획 도구다. 판정 문턱은 여기서 바뀌지 않는다.",
           "usd_per_call": USD_PER_CALL, "concepts": {}}
    print(f"층위 {tier} — 호출 수를 늘리면 판정이 설 확률 (시행 {TRIALS}회)")
    for concept, j in res["tiers"][tier]["per_concept"].items():
        vals = j.get("novelty_by_call") or []
        if len(vals) < 3:
            continue
        rows = [power_for(vals, n, rng) for n in CALL_GRID]
        out["concepts"][concept] = {"observed_mean": j["mean_novelty"],
                                    "power": rows}
        cells = "  ".join(f"{r['calls']}회 {r['decided']:.0%}" for r in rows)
        print(f"  {concept} (관측 {j['mean_novelty']:.2f}): {cells}")
    # 필요 호출 수 → 비용
    for target in (0.8,):
        need = {}
        for c, d in out["concepts"].items():
            hit = next((r["calls"] for r in d["power"]
                        if r["decided"] >= target), None)
            need[c] = hit
        out[f"calls_for_power_{target}"] = need
        undecidable = [c for c, v in need.items() if v is None]
        cost = sum((v - 10) * USD_PER_CALL for v in need.values() if v)
        print(f"검정력 {target:.0%}에 필요한 호출: {need}")
        print(f"  추가 비용(이미 돈 10회 제외): 약 ${cost:.2f}"
              + (f"  / 표에서 못 닿는 개념: {undecidable}" if undecidable else ""))
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    print(f"기록: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
