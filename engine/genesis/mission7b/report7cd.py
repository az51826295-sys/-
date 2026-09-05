"""7C/7D distribution metrics, recomputed from the raw registries.

Restores the analysis that produced brief sections 2.6/2.7 (the
original was run ad hoc and never committed — an audit on 2026-08-02
found only the breakthrough counts were reproducible). Definitions:

- relaxation variant: a rule inside a valid candidate whose conditions
  include consecutive_all_pass and whose actions include SHARE_BEST
  (autopsy.py's _is_relax), counted once per (candidate, rule).
- gain-조건 포함율: fraction of relax variants with a my_best_gain
  condition.
- P9 비율: fraction of relax variants with priority == 9.
- 무예산-조건 비율: fraction of relax variants with NO condition
  besides consecutive_all_pass and my_best_gain (the winning family's
  "no extra condition" shape; remaining_budget_ratio is the dominant
  extra, hence the table label).
- score>=0.84 변형: count of relax variants whose candidate scored
  >= 0.84 on the blind validation.
- 중복률: candidate whose artifact (rules + threshold, ids stripped)
  equals any earlier candidate or the founding incumbent within the
  same run; numerator and denominator both exclude op == "invalid"
  (this is what reproduces the published cells; report7b's hygiene
  divides by all candidates instead).
- 무효율: op == "invalid" fraction of all candidates.
- 돌파: final incumbent_score > 0.80 (design P38b, frozen 2026-08-01).

  python -m genesis.mission7b.report7cd            # current groups
  python -m genesis.mission7b.report7cd --check    # + brief 2.6/2.7
                                                   #   reproduction test
"""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter

from genesis.mission7b.autopsy import _is_relax
from genesis.mission7b.report7b import _protocol_key

DATA = "data"
SEEDS = (0, 1, 2, 3, 4)
BREAKTHROUGH = 0.80

# group label -> registry tag template
GROUPS = {
    "T": "T_deadlock_ms{m}",
    "TM": "TM_deadlock_ms{m}",
    "TP": "TP_deadlock_ms{m}",
    "TS": "TS_deadlock_ms{m}",
    "T-cold": "T_deadlock_ms{m}_t0.3",
}

# brief 2.6/2.7 published cells (the reproduction target for --check)
PUBLISHED = {
    "T": {"gain": 0.05, "p9": 0.39, "no_budget": 0.08, "hi": 0,
          "dup": 0.885, "breakthrough": 0},
    "TM": {"gain": 0.49, "p9": 0.62, "no_budget": 0.58, "hi": 61,
           "dup": 0.725, "breakthrough": 2},
    "TP": {"gain": 0.66, "p9": 0.59, "no_budget": 0.67, "hi": 170,
           "dup": 0.783, "breakthrough": 4},
    "TS": {"gain": 0.97, "p9": 0.38, "no_budget": 0.97, "hi": None,
           "dup": 0.870, "breakthrough": 2},
    "T-cold": {"gain": 0.00, "p9": 0.59, "no_budget": 0.00, "hi": None,
               "dup": 0.972, "breakthrough": 0},
}


def _reg(tag: str) -> dict:
    with open(os.path.join(DATA, f"mission7b_{tag}_registry.json"),
              encoding="utf-8") as f:
        return json.load(f)


def group_metrics(template: str) -> dict:
    variants = []          # (has_gain, is_p9, no_budget, score)
    dup = invalid = total = 0
    breakthrough = 0
    finals = []
    for ms in SEEDS:
        reg = _reg(template.format(m=ms))
        finals.append(reg["incumbent_score"])
        breakthrough += reg["incumbent_score"] > BREAKTHROUGH
        seen = {_protocol_key(reg["versions"]["0"])}
        for g in reg["generations"]:
            for c in g["candidates"]:
                total += 1
                if c["op"] == "invalid":
                    invalid += 1
                    continue
                key = _protocol_key(c["artifact"])
                if key in seen:
                    dup += 1
                seen.add(key)
                for r in c["artifact"]["rules"]:
                    if not _is_relax(r):
                        continue
                    metrics = {cc["metric"] for cc in r["conditions"]}
                    variants.append((
                        "my_best_gain" in metrics,
                        r["priority"] == 9,
                        not (metrics - {"consecutive_all_pass",
                                        "my_best_gain"}),
                        c["score"]))
    n = len(variants) or 1
    valid = (total - invalid) or 1
    joint = Counter((g, p, b) for g, p, b, _ in variants)
    return {
        "n_variants": len(variants),
        "gain": sum(v[0] for v in variants) / n,
        "p9": sum(v[1] for v in variants) / n,
        "no_budget": sum(v[2] for v in variants) / n,
        "hi": sum(1 for v in variants if v[3] >= 0.84),
        "dup": dup / valid,
        "invalid": invalid / total,
        "breakthrough": breakthrough,
        "finals": [round(f, 4) for f in finals],
        "joint": {f"gain={g} p9={p} nobudget={b}": c
                  for (g, p, b), c in sorted(joint.items())},
    }


def format_table(rows: dict[str, dict]) -> str:
    head = (f"{'군':8s} {'돌파':>4s} {'gain':>5s} {'P9':>5s} "
            f"{'무예산':>5s} {'≥0.84':>5s} {'중복률':>6s} {'무효율':>6s} "
            f"{'변형수':>5s}")
    lines = [head]
    for label, m in rows.items():
        lines.append(
            f"{label:8s} {m['breakthrough']}/5  {m['gain']:.2f}  "
            f"{m['p9']:.2f}  {m['no_budget']:.2f}  {m['hi']:5d} "
            f"{m['dup']:.3f}  {m['invalid']:.3f}  {m['n_variants']:5d}")
    return "\n".join(lines)


def check(rows: dict[str, dict]) -> bool:
    """Compare recomputed cells against brief 2.6/2.7 (2dp for rates,
    3dp for dup, exact for counts)."""
    ok = True
    for label, pub in PUBLISHED.items():
        got = rows[label]
        for key, want in pub.items():
            if want is None:
                continue
            have = got[key]
            match = (have == want if isinstance(want, int)
                     else abs(have - want)
                     < (0.0005 if key == "dup" else 0.005))
            mark = "OK" if match else "MISMATCH"
            if not match:
                ok = False
                print(f"  {label}.{key}: 재계산 {have} vs 브리프 {want}"
                      f" -> {mark}")
    print("재현 판정:", "통과 — 브리프 2.6/2.7 전 셀 일치"
          if ok else "실패 — 위 셀 불일치")
    return ok


def main() -> None:
    parser = argparse.ArgumentParser(prog="genesis.mission7b.report7cd")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--joint", action="store_true",
                        help="gain/P9/무예산 공동분포 출력")
    parser.add_argument("--extra", default="",
                        help="추가 군 label=tag_template, 콤마 구분 "
                             "(예: T-hot13=T_deadlock_ms{m}_t1.3)")
    args = parser.parse_args()

    groups = dict(GROUPS)
    for pair in filter(None, args.extra.split(",")):
        label, template = pair.split("=", 1)
        groups[label] = template
    rows = {label: group_metrics(t) for label, t in groups.items()}
    print(format_table(rows))
    if args.joint:
        for label, m in rows.items():
            print(f"\n{label} 공동분포:")
            for k, v in m["joint"].items():
                print(f"  {k}: {v}")
    if args.check:
        print()
        raise SystemExit(0 if check(rows) else 1)


if __name__ == "__main__":
    main()
