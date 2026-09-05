"""다양성 축 — 한계비용 곡선 v0 (docs/diversity-q1-v0-design.md).

사전 등록된 규칙만 구현한다. 이 파일에 새 특징·새 문턱을 만들지 않는다.

  python -X utf8 tools/diversity_curve.py --out data/diversity_q1_v0.json

지출 0. 기존 실행 로그와 저장된 후보 SVG만 읽는다.
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

from genesis import icon_lane            # noqa: E402
from genesis import taste_features       # noqa: E402

# --- 설계 §5에서 온 동결값. 여기서 바꾸면 테스트가 막는다 ---------------
FLAT_LOWER = 0.80        # 95% 하한이 이 이상이면 flat
SATURATING_UPPER = 0.50  # 95% 상한이 이 이하면 saturating
MIN_CONCEPTS = 8
MIN_CANDIDATES = 40
MIN_PER_CONCEPT = 6
TIERS = ("T1", "T2", "T3")

# 계산 세부(문턱이 아니다 — 재현성을 위해 고정)
BOOTSTRAP_N = 10000
BOOTSTRAP_SEED = 12345

RUNS = (("pick-v1", "data/icon_lane_pick_v1.json"),
        ("pick-v2", "data/icon_lane_pick_v2.json"))


def signatures(svg: str) -> dict:
    """세 층위의 서명. 전부 파라미터 0개, 동결된 파서·특징만 쓴다."""
    _groups, names, _curved, _total = taste_features._shape_points(svg)
    tags = tuple(sorted(names))
    m = taste_features.measure(svg)
    return {"T1": icon_lane.structure_hash(svg),
            "T2": repr((tags, m["path_count"], m["shape_count"])),
            "T3": repr(tags)}


def load_concepts(root: str = ROOT) -> list:
    """(회차, 개념, 통과 후보 SVG 목록). 저장된 후보 = 통과분이다."""
    out = []
    for run, rel in RUNS:
        path = os.path.join(root, rel)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            log = json.load(fh)
        passed_total = sum(r["passed"] for res in log["results"]
                           for r in res["rounds"])
        generated = sum(r["candidates"] for res in log["results"]
                        for r in res["rounds"])
        for res in log["results"]:
            paths = res.get("candidate_paths") or []
            svgs, missing = [], []
            for p in paths:
                full = os.path.join(root, p.replace("\\", os.sep))
                if os.path.exists(full):
                    with open(full, encoding="utf-8") as fh:
                        svgs.append(fh.read())
                else:
                    missing.append(p)
            out.append({"run": run, "concept": res["concept"],
                        "used_rounds": res.get("used_rounds"),
                        "n_passed": len(svgs), "missing": missing,
                        "svgs": svgs,
                        "run_pass_rate": (passed_total / generated
                                          if generated else None)})
    return out


def good_turing_u(sigs: list):
    """다음 후보가 새 서명일 확률의 Good-Turing 추정 f1/N."""
    if not sigs:
        return None
    counts = {}
    for s in sigs:
        counts[s] = counts.get(s, 0) + 1
    f1 = sum(1 for c in counts.values() if c == 1)
    return f1 / len(sigs)


def _bootstrap_ci(values: list, n: int = BOOTSTRAP_N,
                  seed: int = BOOTSTRAP_SEED) -> tuple:
    """개념을 표본 단위로 재추출한 평균의 95% 구간."""
    if not values:
        return (None, None)
    rng = random.Random(seed)
    k = len(values)
    means = []
    for _ in range(n):
        means.append(sum(values[rng.randrange(k)] for _ in range(k)) / k)
    means.sort()
    lo = means[int(0.025 * (n - 1))]
    hi = means[int(0.975 * (n - 1))]
    return (lo, hi)


def analyse(concepts: list) -> dict:
    """설계 §5의 판정식. 층위 사다리 → 표본 관문 → 3값."""
    included = [c for c in concepts if c["n_passed"] >= MIN_PER_CONCEPT]
    excluded = [{"run": c["run"], "concept": c["concept"],
                 "n_passed": c["n_passed"], "reason": "per_concept_min"}
                for c in concepts if c["n_passed"] < MIN_PER_CONCEPT]
    n_cand = sum(c["n_passed"] for c in included)
    gate_ok = (len(included) >= MIN_CONCEPTS and n_cand >= MIN_CANDIDATES)

    tiers = {}
    for tier in TIERS:
        per_concept, dup_total = [], 0
        for c in included:
            sigs = [signatures(s)[tier] for s in c["svgs"]]
            u = good_turing_u(sigs)
            dup_total += len(sigs) - len(set(sigs))
            per_concept.append({"run": c["run"], "concept": c["concept"],
                                "n": c["n_passed"], "distinct": len(set(sigs)),
                                "u": u})
        us = [p["u"] for p in per_concept if p["u"] is not None]
        mean_u = sum(us) / len(us) if us else None
        lo, hi = _bootstrap_ci(us)
        tiers[tier] = {"per_concept": per_concept, "mean_u": mean_u,
                       "ci95": [lo, hi], "duplicates": dup_total,
                       "has_resolution": dup_total > 0}

    chosen = next((t for t in TIERS if tiers[t]["has_resolution"]), None)

    if chosen is None:
        verdict, why = "undefined", "no_resolution_at_any_tier"
    elif not gate_ok:
        verdict, why = "undefined", "sample_gate"
    else:
        lo, hi = tiers[chosen]["ci95"]
        if lo is not None and lo >= FLAT_LOWER:
            verdict, why = "flat", "ci_lower_ge_flat"
        elif hi is not None and hi <= SATURATING_UPPER:
            verdict, why = "saturating", "ci_upper_le_saturating"
        else:
            verdict, why = "undefined", "ci_straddles"

    marginal = None
    if chosen and tiers[chosen]["mean_u"]:
        mean_u = tiers[chosen]["mean_u"]
        rates = [c["run_pass_rate"] for c in included if c["run_pass_rate"]]
        pass_rate = sum(rates) / len(rates) if rates else None
        marginal = {"per_passed_candidate": 1 / mean_u,
                    "per_generated_candidate": ((1 / mean_u) / pass_rate
                                                if pass_rate else None),
                    "pass_rate_used": pass_rate}

    return {"spec": "diversity-q1-v0",
            "design": "docs/diversity-q1-v0-design.md",
            "verdict": verdict, "why": why, "tier_used": chosen,
            "sample": {"concepts": len(included), "candidates": n_cand,
                       "gate_ok": gate_ok, "excluded": excluded,
                       "min_concepts": MIN_CONCEPTS,
                       "min_candidates": MIN_CANDIDATES,
                       "min_per_concept": MIN_PER_CONCEPT},
            "thresholds": {"flat_lower": FLAT_LOWER,
                           "saturating_upper": SATURATING_UPPER},
            "bootstrap": {"n": BOOTSTRAP_N, "seed": BOOTSTRAP_SEED},
            "tiers": tiers, "marginal_cost": marginal}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="data/diversity_q1_v0.json")
    a = ap.parse_args(argv)
    res = analyse(load_concepts())
    out = os.path.join(ROOT, a.out)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)
    t = res["tier_used"]
    print(f"판정: {res['verdict']} ({res['why']})  층위: {t}")
    print(f"표본: 개념 {res['sample']['concepts']}, 통과후보 "
          f"{res['sample']['candidates']}, 관문 {res['sample']['gate_ok']}")
    for tier in TIERS:
        d = res["tiers"][tier]
        mu = "-" if d["mean_u"] is None else f"{d['mean_u']:.3f}"
        ci = d["ci95"]
        cis = "-" if ci[0] is None else f"[{ci[0]:.3f}, {ci[1]:.3f}]"
        print(f"  {tier}: mean_u={mu} ci95={cis} 중복={d['duplicates']} "
              f"분해능={'있음' if d['has_resolution'] else '없음'}")
    if res["marginal_cost"]:
        m = res["marginal_cost"]
        gen = m["per_generated_candidate"]
        print(f"한계비용: 통과후보 {m['per_passed_candidate']:.2f}개 / 새것 1개"
              + (f", 생성후보 {gen:.2f}개" if gen else ""))
    print(f"기록: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
