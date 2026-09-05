"""블라인드 선별 집계 (docs/tier-compare-v0-design.md §8).

  python -X utf8 tools/tier_blind_tally.py

지출 0. **정답지를 여는 유일한 자리**다 — 선별 기록이 이미 커밋된 뒤에만 돈다.
귀무값은 균등이 아니라 **각 개념 풀의 실제 구성**이다(판이 기울어 있다).
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

TRIALS = 10000
SEED = 12345
ALPHA = 0.05
MIN_PICKS = 20
MIN_CONCEPTS = 8


def load(pick_path: str, key_path: str, root: str = ROOT) -> dict:
    with open(os.path.join(root, pick_path), encoding="utf-8") as fh:
        session = json.load(fh)
    with open(os.path.join(root, key_path), encoding="utf-8") as fh:
        key = json.load(fh)["key"]
    pool, picked = {}, {}
    for g in session["groups"]:
        name = g["group"]
        arms, chosen = [], []
        for row in g["shown"]:
            fname = os.path.basename(row["path"].replace("\\", "/"))
            arm = key.get(f"{name}/{fname}")
            arms.append(arm)
            if row["picked"]:
                chosen.append(arm)
        pool[name] = arms
        picked[name] = chosen
    return {"pool": pool, "picked": picked, "session": session["id"]}


def tally(data: dict, trials: int = TRIALS, seed: int = SEED) -> dict:
    pool, picked = data["pool"], data["picked"]
    tiers = sorted({a for arms in pool.values() for a in arms if a})
    obs = {t: 0 for t in tiers}
    n_picks = 0
    for concept, chosen in picked.items():
        for arm in chosen:
            if arm:
                obs[arm] += 1
                n_picks += 1

    rng = random.Random(seed)
    draws = {t: [] for t in tiers}
    for _ in range(trials):
        counts = {t: 0 for t in tiers}
        for concept, arms in pool.items():
            k = len(picked[concept])
            if not k:
                continue
            for arm in rng.sample(arms, k):        # 비복원
                if arm:
                    counts[arm] += 1
        for t in tiers:
            draws[t].append(counts[t])

    out = {}
    for t in tiers:
        exp = sum(draws[t]) / trials
        # 양측: 기대에서 관측만큼 멀리 떨어진 표본의 비율
        d = abs(obs[t] - exp)
        p = sum(1 for v in draws[t] if abs(v - exp) >= d - 1e-9) / trials
        gate = n_picks >= MIN_PICKS and len(pool) >= MIN_CONCEPTS
        if not gate:
            v = "undefined"
            why = "sample_gate"
        elif p < ALPHA and obs[t] > exp:
            v, why = "preferred", "permutation_significant"
        elif p < ALPHA and obs[t] < exp:
            v, why = "avoided", "permutation_significant"
        else:
            v, why = "undefined", "not_significant"
        out[t] = {"observed": obs[t], "expected": round(exp, 2),
                  "p_value": p, "verdict": v, "why": why,
                  "pool_share": round(
                      sum(1 for arms in pool.values() for a in arms if a == t)
                      / sum(1 for arms in pool.values() for a in arms if a), 4)}
    return {"spec": "tier-blind-tally-v0",
            "design": "docs/tier-compare-v0-design.md",
            "trials": trials, "seed": seed, "alpha": ALPHA,
            "n_picks": n_picks, "n_concepts": len(pool),
            "gate_ok": n_picks >= MIN_PICKS and len(pool) >= MIN_CONCEPTS,
            "by_tier": out,
            "per_concept": {c: {"picked": len(picked[c]),
                                "pool": len(pool[c]),
                                "picked_arms": picked[c]}
                            for c in sorted(pool)}}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--picks", default="data/picks/tier-blind-v1.json")
    ap.add_argument("--key", default="data/tier_blind_key.json")
    ap.add_argument("--out", default="data/tier_blind_tally_v0.json")
    a = ap.parse_args(argv)
    res = tally(load(a.picks, a.key))
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)
    print(f"선택 {res['n_picks']}개 · 개념 {res['n_concepts']} · "
          f"순열 {res['trials']}회")
    for t, d in sorted(res["by_tier"].items(),
                       key=lambda kv: -kv[1]["observed"]):
        print(f"  {t:<7} 관측 {d['observed']:2d}  기대 {d['expected']:5.2f}  "
              f"(판 점유 {d['pool_share']:.2f})  p={d['p_value']:.4f}  "
              f"→ {d['verdict']}")
    print(f"기록: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
