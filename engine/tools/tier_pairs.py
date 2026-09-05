"""티어 짝비교 판 (docs/tier-pair-test-v0-design.md).

  python -X utf8 tools/tier_pairs.py --a haiku --b opus
  python -X utf8 tools/tier_pairs.py --record "1=L 2=R 3=skip ..."

지출 0. 같은 개념의 두 티어 후보를 나란히 놓고 하나만 고르게 한다. 좌우는
쌍마다 무작위이고, 화면 어디에도 티어가 없다. 정답지는 따로 둔다.
"""
from __future__ import annotations

import argparse
import html
import json
import math
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

SEED = 12345
PAIRS_PER_CONCEPT = 3
MIN_VALID_PAIRS = 20
ALPHA = 0.05


def build(run_path: str, arm_a: str, arm_b: str, root: str = ROOT,
          seed: int = SEED) -> dict:
    with open(os.path.join(root, run_path), encoding="utf-8") as fh:
        rec = json.load(fh)
    pool: dict = {}
    for arm in (arm_a, arm_b):
        for r in rec["rows"].get(arm, []):
            if r.get("verdict") == "PASS" and r.get("svg"):
                pool.setdefault(r["concept"], {}).setdefault(arm, []).append(
                    r["svg"])

    rng = random.Random(seed)
    pairs, skipped = [], []
    for concept in sorted(pool):
        a_list = list(pool[concept].get(arm_a, []))
        b_list = list(pool[concept].get(arm_b, []))
        rng.shuffle(a_list)
        rng.shuffle(b_list)
        n = min(PAIRS_PER_CONCEPT, len(a_list), len(b_list))
        if n < PAIRS_PER_CONCEPT:
            skipped.append({"concept": concept, "made": n,
                            "why": f"{arm_a} {len(a_list)}개 / "
                                   f"{arm_b} {len(b_list)}개"})
        for i in range(n):
            left_is_a = rng.random() < 0.5      # 좌우를 쌍마다 섞는다
            pairs.append({
                "no": len(pairs) + 1, "concept": concept,
                "left": a_list[i] if left_is_a else b_list[i],
                "right": b_list[i] if left_is_a else a_list[i],
                "left_arm": arm_a if left_is_a else arm_b,
                "right_arm": arm_b if left_is_a else arm_a})
    return {"spec": "tier-pair-test-v0",
            "design": "docs/tier-pair-test-v0-design.md",
            "arms": [arm_a, arm_b], "seed": seed,
            "pairs": pairs, "skipped": skipped, "n_pairs": len(pairs)}


def sheet(board: dict) -> str:
    css = """<style>
  body { font: 15px/1.6 system-ui, sans-serif; margin: 24px; background:#fff;
         color:#111827; }
  .pair { display:flex; align-items:center; gap:16px; padding:12px 0;
          border-bottom:1px solid #e5e7eb; }
  .no { font-weight:700; width:34px; font-variant-numeric:tabular-nums; }
  .concept { width:96px; color:#6b7280; font-size:13px; }
  .side { width:120px; text-align:center; border:1px solid #e5e7eb;
          border-radius:10px; padding:10px; }
  .side svg { width:64px; height:64px; color:#111827; }
  .tag { font-size:12px; color:#6b7280; margin-top:4px; }
  code { background:#f3f4f6; padding:1px 5px; border-radius:4px; }
  .note { color:#6b7280; font-size:13.5px; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) body { background:#0b0f19; color:#e5e7eb; }
    :root:not([data-theme="light"]) .side { border-color:#374151; }
    :root:not([data-theme="light"]) .side svg { color:#e5e7eb; }
    :root:not([data-theme="light"]) .pair { border-color:#1f2937; }
    :root:not([data-theme="light"]) code { background:#1f2937; }
  }
  :root[data-theme="dark"] body { background:#0b0f19; color:#e5e7eb; }
  :root[data-theme="dark"] .side { border-color:#374151; }
  :root[data-theme="dark"] .side svg { color:#e5e7eb; }
  :root[data-theme="dark"] .pair { border-color:#1f2937; }
  :root[data-theme="dark"] code { background:#1f2937; }
</style>"""
    head = (f'<title>어느 쪽이 낫습니까</title>{css}'
            f'<h1>짝비교 — 어느 쪽이 낫습니까</h1>'
            f'<p class="note">같은 개념의 아이콘 <b>두 개</b>입니다. 둘 다 이미 '
            f'규격은 통과했습니다. 어느 모델이 만든 것인지는 화면 어디에도 '
            f'없습니다(정답지는 봉해 뒀습니다).<br>'
            f'쌍마다 <b>L</b>(왼쪽) 또는 <b>R</b>(오른쪽)만 주십시오. 둘 다 별로면 '
            f'<b>skip</b>. 예: <code>1=L 2=R 3=skip 4=L …</code></p>')
    rows = []
    for p in board["pairs"]:
        rows.append(
            f'<div class="pair"><div class="no">{p["no"]}</div>'
            f'<div class="concept">{html.escape(p["concept"])}</div>'
            f'<div class="side">{p["left"]}<div class="tag">L</div></div>'
            f'<div class="side">{p["right"]}<div class="tag">R</div></div>'
            f'</div>')
    return head + "\n".join(rows)


def _binom_two_sided(k: int, n: int) -> float:
    """p=0.5 양측 이항 검정. 라이브러리 없이 정확히 센다."""
    if n == 0:
        return 1.0
    def pmf(i):
        return math.comb(n, i) / (2 ** n)
    obs = pmf(k)
    return min(1.0, sum(pmf(i) for i in range(n + 1) if pmf(i) <= obs + 1e-12))


def judge(board: dict, answers: dict) -> dict:
    """설계 §2. answers: {번호: 'L'|'R'|'skip'}"""
    by_no = {p["no"]: p for p in board["pairs"]}
    arm_b = board["arms"][1]
    k = n = 0
    rows = []
    for no, ans in sorted(answers.items()):
        p = by_no.get(no)
        if not p or ans not in ("L", "R"):
            rows.append({"no": no, "answer": ans, "chose": None})
            continue
        chosen = p["left_arm"] if ans == "L" else p["right_arm"]
        n += 1
        if chosen == arm_b:
            k += 1
        rows.append({"no": no, "concept": p["concept"], "answer": ans,
                     "chose": chosen})
    pval = _binom_two_sided(k, n)
    if n < MIN_VALID_PAIRS:
        v, why = "undefined", "sample_gate"
    elif pval < ALPHA and k * 2 > n:
        v, why = "taste_prefers_expensive", "binomial_significant"
    elif pval < ALPHA and k * 2 < n:
        v, why = "taste_prefers_cheap", "binomial_significant"
    else:
        v, why = "undefined", "not_significant"
    return {"verdict": v, "why": why, "k_expensive": k, "n_valid": n,
            "rate": (k / n if n else None), "p_value": pval,
            "alpha": ALPHA, "min_valid_pairs": MIN_VALID_PAIRS,
            "arms": board["arms"], "rows": rows}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--run", default="data/tier_compare_v0.json")
    ap.add_argument("--a", default="haiku")
    ap.add_argument("--b", default="opus")
    ap.add_argument("--board", default="data/tier_pairs_board.json")
    ap.add_argument("--sheet", default="out/icons/tier-pairs.html")
    ap.add_argument("--record", help='답: "1=L 2=R 3=skip ..."')
    ap.add_argument("--out", default="data/tier_pairs_result.json")
    a = ap.parse_args(argv)

    if a.record:
        with open(os.path.join(ROOT, a.board), encoding="utf-8") as fh:
            board = json.load(fh)
        answers = {}
        for tok in a.record.replace(",", " ").split():
            if "=" not in tok:
                continue
            no, ans = tok.split("=", 1)
            answers[int(no)] = ans.strip().upper() if ans.strip().lower() != "skip" else "skip"
        res = judge(board, answers)
        with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
            json.dump(res, fh, ensure_ascii=False, indent=2)
        print(f"유효 쌍 {res['n_valid']} / 비싼 쪽 선택 {res['k_expensive']}"
              f" ({(res['rate'] or 0):.2f})  p={res['p_value']:.4f}")
        print(f"판정: {res['verdict']} ({res['why']})")
        print(f"기록: {a.out}")
        return 0

    board = build(a.run, a.a, a.b)
    with open(os.path.join(ROOT, a.board), "w", encoding="utf-8") as fh:
        json.dump(board, fh, ensure_ascii=False, indent=2)
    path = os.path.join(ROOT, a.sheet)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(sheet(board))
    print(f"쌍 {board['n_pairs']}개 ({a.a} vs {a.b}) → {a.sheet}")
    for s in board["skipped"]:
        print(f"  {s['concept']}: {s['made']}쌍만 — {s['why']}")
    print(f"정답지: {a.board} (고르신 뒤에 연다)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
