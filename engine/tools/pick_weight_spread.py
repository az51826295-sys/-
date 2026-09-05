"""사람 선택 vs 무작위 세트의 시각 무게 폭 (docs/pick-weight-spread-v0-design.md).

  python -X utf8 tools/pick_weight_spread.py

지출 0. **탐색적**이다 — 가설이 관측에서 나왔다(설계 §0). 확정 판정이 아니다.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import svg_raster                           # noqa: E402

TRIALS = 10000
SEED = 12345
MIN_CONCEPTS = 8
MIN_PER_CONCEPT = 3
SIGNAL_P = 0.05
NO_SIGNAL_P = 0.50
PICK_FILES = ("data/picks/pick-v2.json", "data/picks/pick-v2-equipment.json")
POOL_DIR = "out/icons/pick-v2/candidates"


def load_picks(root: str = ROOT) -> dict:
    """개념 → 사장님이 고른 파일 경로."""
    out = {}
    for f in PICK_FILES:
        p = os.path.join(root, f)
        if not os.path.exists(p):
            continue
        d = json.load(open(p, encoding="utf-8"))
        for g in d["groups"]:
            for s in g["shown"]:
                if s.get("picked"):
                    out[g["group"]] = s["path"].replace("\\", "/")
    return out


def load_pool(root: str = ROOT) -> dict:
    """개념 → 통과 후보 SVG 목록(저장된 것이 곧 통과분)."""
    pool = {}
    for gdir in sorted(glob.glob(os.path.join(root, POOL_DIR, "*"))):
        if not os.path.isdir(gdir):
            continue
        svgs = []
        for f in sorted(glob.glob(os.path.join(gdir, "*.svg"))):
            with open(f, encoding="utf-8") as fh:
                svgs.append((os.path.relpath(f, root).replace("\\", "/"),
                             fh.read()))
        if svgs:
            pool[os.path.basename(gdir)] = svgs
    return pool


def spread(svgs: list) -> float | None:
    return svg_raster.optical_weight_delta(svgs)


def run(root: str = ROOT) -> dict:
    pool = load_pool(root)
    picks = load_picks(root)
    concepts = sorted(set(pool) & set(picks))
    gate_ok = (len(concepts) >= MIN_CONCEPTS
               and all(len(pool[c]) >= MIN_PER_CONCEPT for c in concepts))
    if not svg_raster.available():
        return {"verdict": "undefined", "why": "래스터 없음(미측정)"}

    # 무게는 후보마다 한 번만 잰다(같은 파일을 만 번 그리지 않는다)
    weights = {c: [svg_raster.optical_weight(s) for _p, s in pool[c]]
               for c in concepts}
    chosen_w = []
    for c in concepts:
        paths = [p for p, _s in pool[c]]
        idx = paths.index(picks[c]) if picks[c] in paths else None
        if idx is None:
            return {"verdict": "undefined",
                    "why": f"고른 파일이 풀에 없다: {picks[c]}"}
        chosen_w.append(weights[c][idx])
    chosen = max(chosen_w) - min(chosen_w)

    machine_w = [weights[c][0] for c in concepts]     # 각 개념의 첫 통과분
    machine = max(machine_w) - min(machine_w)

    rng = random.Random(SEED)
    draws = []
    for _ in range(TRIALS):
        ws = [weights[c][rng.randrange(len(weights[c]))] for c in concepts]
        draws.append(max(ws) - min(ws))
    draws.sort()
    le = sum(1 for d in draws if d <= chosen)
    p = le / TRIALS
    machine_pct = sum(1 for d in draws if d <= machine) / TRIALS
    median = draws[TRIALS // 2]

    if not gate_ok:
        v, why = "undefined", "sample_gate"
    elif p < SIGNAL_P:
        v, why = "picks_reduce_spread", "p_below_threshold"
    elif p > NO_SIGNAL_P:
        v, why = "no_signal", "p_above_half"
    else:
        v, why = "undefined", "in_between"
    return {"spec": "pick-weight-spread-v0",
            "design": "docs/pick-weight-spread-v0-design.md",
            "exploratory": True,
            "note": "가설이 관측에서 나왔다 — 확정 판정이 아니다(설계 §0)",
            "verdict": v, "why": why, "p": p,
            "chosen_spread": chosen, "machine_first_spread": machine,
            "machine_percentile": machine_pct,
            "random_median": median,
            "random_min": draws[0], "random_max": draws[-1],
            "concepts": concepts, "trials": TRIALS, "seed": SEED,
            "gate_ok": gate_ok,
            "per_concept": {c: {"n": len(weights[c]),
                                "chosen": chosen_w[i],
                                "min": min(weights[c]),
                                "max": max(weights[c])}
                            for i, c in enumerate(concepts)}}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="data/pick_weight_spread_v0.json")
    a = ap.parse_args(argv)
    res = run()
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)
    if "p" not in res:
        print(res)
        return 0
    print(f"개념 {len(res['concepts'])} · 무작위 세트 {res['trials']}회")
    print(f"  사장님 세트 폭   {res['chosen_spread']:.4f}  → p = {res['p']:.4f}")
    print(f"  기계 첫 통과분   {res['machine_first_spread']:.4f}  "
          f"(백분위 {res['machine_percentile']:.2f})")
    print(f"  무작위 중앙값    {res['random_median']:.4f}  "
          f"[{res['random_min']:.4f}, {res['random_max']:.4f}]")
    print(f"판정(탐색적): {res['verdict']} ({res['why']})")
    print(f"기록: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
