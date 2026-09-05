"""세트 영향 — 이 선택이 세트를 어떻게 바꾸는지 **되묻기 위한** 표.

  python -X utf8 tools/set_impact.py

기계가 고르지 않는다(선별 규율). 대신 **고른 것이 세트에 무엇을 했는지** 보여주고
더 나은 자리를 알려준 뒤 되묻는다:

    06_stats에서 고르신 것은 세트 폭을 0.136으로 만듭니다.
    같은 자리의 다른 후보로 바꾸면 0.091까지 내려갑니다. 그래도 이걸로 갈까요?

지출 0. 판정하지 않는다 — `icon_judge.judge_set`이 판정을 갖고 있고, 이 도구는
그 판정을 **사람이 고칠 수 있는 형태**로 옮긴다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import svg_raster                           # noqa: E402
from tools import icon_judge                             # noqa: E402
from tools import pick_weight_spread as pws              # noqa: E402


def _spread(ws: list) -> float:
    return max(ws) - min(ws)


def analyse(root: str = ROOT) -> dict:
    if not svg_raster.available():
        return {"error": "래스터 경로 없음 — 세트 무게를 잴 수 없다"}
    pool = pws.load_pool(root)
    picks = pws.load_picks(root)
    concepts = sorted(set(pool) & set(picks))
    if not concepts:
        return {"error": "고른 기록이 없다"}

    weights = {c: [svg_raster.optical_weight(s) for _p, s in pool[c]]
               for c in concepts}
    paths = {c: [p for p, _s in pool[c]] for c in concepts}
    chosen_idx = {c: paths[c].index(picks[c]) for c in concepts
                  if picks[c] in paths[c]}
    if len(chosen_idx) != len(concepts):
        return {"error": "고른 파일이 풀에 없다"}

    base = [weights[c][chosen_idx[c]] for c in concepts]
    base_spread = _spread(base)
    doc = icon_judge.load_spec()
    limit = doc.get("hidden", {}).get("set_consistency", {}).get(
        "optical_weight_delta_max")

    rows = []
    for i, c in enumerate(concepts):
        best_j, best_spread = chosen_idx[c], base_spread
        for j in range(len(weights[c])):
            trial = list(base)
            trial[i] = weights[c][j]
            s = _spread(trial)
            if s < best_spread - 1e-9:
                best_j, best_spread = j, s
        rows.append({
            "concept": c,
            "chosen": os.path.basename(paths[c][chosen_idx[c]]),
            "chosen_weight": weights[c][chosen_idx[c]],
            "spread_now": base_spread,
            "best_alt": os.path.basename(paths[c][best_j]),
            "best_alt_weight": weights[c][best_j],
            "spread_if_swapped": best_spread,
            "gain": base_spread - best_spread,
            "is_current_best": best_j == chosen_idx[c]})
    rows.sort(key=lambda r: -r["gain"])
    return {"spec": "set-impact-v0",
            "design": "docs/pick-weight-spread-v0-design.md",
            "note": "판정이 아니라 되묻기 재료다. 고르는 것은 사람이다",
            "concepts": concepts, "spread": base_spread, "limit": limit,
            "over_limit": (None if limit is None else base_spread > limit),
            "rows": rows}


def ask_back(res: dict) -> str:
    """사람에게 보여줄 되묻기 문장. 강요하지 않고 사실과 대안만 준다."""
    if "error" in res:
        return res["error"]
    lines = []
    over = res["over_limit"]
    head = (f'지금 고르신 세트의 시각 무게 폭은 **{res["spread"]:.3f}**'
            f'입니다(관문 {res["limit"]}).')
    lines.append(head + (" **관문을 넘습니다.**" if over else " 관문 안입니다."))
    movers = [r for r in res["rows"] if r["gain"] > 0.001]
    if not movers:
        lines.append("어느 자리를 바꿔도 더 좋아지지 않습니다 — 지금이 최선입니다.")
        return "\n".join(lines)
    lines.append("")
    lines.append("폭을 줄이는 자리는 이렇습니다(바꾸면 어떻게 되는지):")
    for r in movers[:3]:
        lines.append(
            f'  - {r["concept"]}: 지금 {r["chosen"]}(무게 {r["chosen_weight"]:.3f}) '
            f'→ {r["best_alt"]}(무게 {r["best_alt_weight"]:.3f})로 바꾸면 '
            f'폭 {r["spread_now"]:.3f} → **{r["spread_if_swapped"]:.3f}**')
    lines.append("")
    lines.append("그래도 지금 고르신 것으로 갈까요? "
                 "세트 일관성은 기계가 재지만, **무엇이 좋은지는 사장님이 정합니다.**")
    return "\n".join(lines)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="data/set_impact_v0.json")
    a = ap.parse_args(argv)
    res = analyse()
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)
    if "error" in res:
        print(res["error"])
        return 0
    print(f"세트 {len(res['concepts'])}개 · 폭 {res['spread']:.4f} "
          f"/ 관문 {res['limit']}")
    for r in res["rows"]:
        mark = "  " if r["is_current_best"] else "→ "
        print(f'{mark}{r["concept"]:<14} {r["chosen"]:<9} '
              f'무게 {r["chosen_weight"]:.4f}  '
              f'바꾸면 {r["spread_if_swapped"]:.4f} (이득 {r["gain"]:+.4f})')
    print()
    print(ask_back(res))
    print(f"\n기록: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
