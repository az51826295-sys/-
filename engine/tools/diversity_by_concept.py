"""개념별 다양성 판정 (docs/diversity-by-concept-v0-design.md).

  python -X utf8 tools/diversity_by_concept.py \\
      --run data/diversity_run_v1_run2.json --out data/diversity_by_concept_v0.json

지출 0 — 이미 있는 실행 기록의 후보만 읽는다. 여러 기록을 주면 개념이 누적된다.

평균 판정(diversity-run-v1)을 지우지 않는다. 같은 자료에 두 판정이 남는다.
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

from tools import diversity_curve as dcv                 # noqa: E402

FLAT_LOWER = dcv.FLAT_LOWER              # 0.80 — 상속, 새 문턱 없음
SATURATING_UPPER = dcv.SATURATING_UPPER  # 0.50
TIERS = dcv.TIERS
MIN_CALLS = 10
MIN_CANDIDATES = 40
MIN_CONCEPTS_FOR_SET = 4                 # 설계 §4 세트 관문
BOOTSTRAP_N = dcv.BOOTSTRAP_N
BOOTSTRAP_SEED = dcv.BOOTSTRAP_SEED


def _bootstrap_ci(values: list) -> tuple:
    if not values:
        return (None, None)
    rng = random.Random(BOOTSTRAP_SEED)
    k = len(values)
    means = sorted(sum(values[rng.randrange(k)] for _ in range(k)) / k
                   for _ in range(BOOTSTRAP_N))
    return (means[int(0.025 * (BOOTSTRAP_N - 1))],
            means[int(0.975 * (BOOTSTRAP_N - 1))])


def chao1(sigs: list) -> dict:
    """앞으로 얼마나 남았나 — 기술 통계다. 판정에 쓰지 않는다(설계 §3)."""
    counts: dict = {}
    for s in sigs:
        counts[s] = counts.get(s, 0) + 1
    s_obs = len(counts)
    f1 = sum(1 for c in counts.values() if c == 1)
    f2 = sum(1 for c in counts.values() if c == 2)
    if f2:
        est = s_obs + (f1 * f1) / (2 * f2)
    else:
        est = s_obs + (f1 * (f1 - 1)) / 2
    return {"observed": s_obs, "chao1": est,
            "coverage": (s_obs / est) if est else None,
            "singletons": f1, "doubletons": f2}


def load_runs(paths: list, root: str = ROOT) -> list:
    """실행 기록 → [{concept, calls:[[sig,...]...]}] (통과 후보만)."""
    out = []
    for p in paths:
        with open(os.path.join(root, p), encoding="utf-8") as fh:
            rec = json.load(fh)
        for run in rec.get("runs", []):
            calls = []
            for call in run.get("calls", []):
                cands = call.get("candidates")
                if cands is None:        # 후보를 안 남긴 옛 기록
                    calls = None
                    break
                calls.append([c["signatures"] for c in cands
                              if c["verdict"] == "PASS"])
            if calls is None:
                out.append({"concept": run["concept"], "source": p,
                            "calls": None,
                            "why": "이 기록에는 후보가 없다(개수만 남았다)"})
                continue
            out.append({"concept": run["concept"], "source": p,
                        "calls": calls, "why": None})
    return out


def judge_concept(calls: list, tier: str) -> dict:
    """설계 §2 — 새것 비율의 평균과 호출 단위 부트스트랩."""
    seen: set = set()
    novelty, pooled = [], []
    for i, call in enumerate(calls):
        sigs = [c[tier] for c in call]
        pooled += sigs
        if i > 0 and sigs:
            novelty.append(sum(1 for s in sigs if s not in seen) / len(sigs))
        seen |= set(sigs)
    n_cand = len(pooled)
    gate_ok = (len(calls) >= MIN_CALLS and n_cand >= MIN_CANDIDATES)
    mean = sum(novelty) / len(novelty) if novelty else None
    lo, hi = _bootstrap_ci(novelty)
    if not gate_ok:
        v, why = "undefined", "sample_gate"
    elif mean is None:
        v, why = "undefined", "no_values"
    elif lo >= FLAT_LOWER:
        v, why = "flat", "ci_lower_ge_flat"
    elif hi <= SATURATING_UPPER:
        v, why = "saturating", "ci_upper_le_saturating"
    else:
        v, why = "undefined", "ci_straddles"
    return {"verdict": v, "why": why, "mean_novelty": mean,
            "ci95": [lo, hi], "calls": len(calls), "candidates": n_cand,
            "novelty_by_call": novelty, "chao1": chao1(pooled),
            "gate_ok": gate_ok}


def analyse(runs: list) -> dict:
    tiers: dict = {}
    for tier in TIERS:
        per_concept, dup, means = {}, 0, []
        for run in runs:
            if run["calls"] is None:
                per_concept[run["concept"]] = {"verdict": "undefined",
                                               "why": run["why"]}
                continue
            j = judge_concept(run["calls"], tier)
            pooled = [c[tier] for call in run["calls"] for c in call]
            dup += len(pooled) - len(set(pooled))
            per_concept[run["concept"]] = j
            if j["mean_novelty"] is not None:
                means.append(j["mean_novelty"])
        # 설계 §6(v0.1): 분해능은 "중복이 있나"가 아니라 **천장에서 떨어져 있나**다.
        # 새것 비율 구간이 1.0을 물면 "다양함"과 "자가 못 가름"이 구분되지 않는다.
        tier_lo, tier_hi = _bootstrap_ci(means)
        has_res = (tier_hi is not None and tier_hi < 1.0)
        judged = [j for j in per_concept.values()
                  if j["verdict"] in ("flat", "saturating")]
        n_sat = sum(1 for j in judged if j["verdict"] == "saturating")
        n_flat = sum(1 for j in judged if j["verdict"] == "flat")
        if len(judged) < MIN_CONCEPTS_FOR_SET:
            sv, sw = "undefined", "set_sample_gate"
        elif n_sat * 2 > len(judged):
            sv, sw = "generator_limited", "majority_saturating"
        elif n_flat * 2 > len(judged):
            sv, sw = "generator_fine", "majority_flat"
        else:
            sv, sw = "undefined", "split"
        tiers[tier] = {"has_resolution": has_res, "duplicates": dup,
                       "tier_mean_ci95": [tier_lo, tier_hi],
                       "per_concept": per_concept,
                       "judged": len(judged), "saturating": n_sat,
                       "flat": n_flat,
                       "set_verdict": {"verdict": sv, "why": sw,
                                       "min_concepts": MIN_CONCEPTS_FOR_SET}}
    chosen = next((t for t in TIERS if tiers[t]["has_resolution"]), None)
    return {"spec": "diversity-by-concept-v0",
            "design": "docs/diversity-by-concept-v0-design.md",
            "tier_used": chosen,
            "thresholds": {"flat_lower": FLAT_LOWER,
                           "saturating_upper": SATURATING_UPPER},
            "tiers": tiers}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--run", action="append", required=True,
                    help="실행 기록 경로. 여러 번 주면 개념이 누적된다")
    ap.add_argument("--out", default="data/diversity_by_concept_v0.json")
    a = ap.parse_args(argv)
    res = analyse(load_runs(a.run))
    res["sources"] = a.run
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)

    tier = res["tier_used"]
    print(f"판정 층위: {tier}")
    if tier:
        t = res["tiers"][tier]
        for concept, j in t["per_concept"].items():
            if "mean_novelty" not in j:
                print(f"  {concept}: {j['verdict']} ({j['why']})")
                continue
            lo, hi = j["ci95"]
            ci = "-" if lo is None else f"[{lo:.3f}, {hi:.3f}]"
            ch = j["chao1"]
            cov = "-" if ch["coverage"] is None else f"{ch['coverage']:.2f}"
            print(f"  {concept}: {j['verdict']:11s} 새것 {j['mean_novelty']:.3f} "
                  f"{ci}  구조 {ch['observed']}/{ch['chao1']:.0f} 커버 {cov}")
        sv = t["set_verdict"]
        print(f"세트 판정: {sv['verdict']} ({sv['why']}) — "
              f"판정된 개념 {t['judged']} (고갈 {t['saturating']}, 평평 {t['flat']})")
    print(f"기록: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
