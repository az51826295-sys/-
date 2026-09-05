"""블라인드 선별 풀 — 티어를 가린 채 후보를 늘어놓는다 (tier-compare §5).

  python -X utf8 tools/blind_pool.py --run data/tier_compare_v0.json \\
      --out out/icons/tier-blind

기계는 규격만 판정한다. **"더 예쁜가"는 사장님이 답한다.** 그때 어느 모델이
만든 것인지 보이면 답이 오염되므로, 파일 이름·순서·기록에서 티어를 지운다.

만드는 것 둘:
  out/icons/tier-blind/candidates/<개념>/cNN.svg   — 사람이 보는 것(티어 없음)
  data/tier_blind_key.json                          — 무엇이 어느 티어였나(정답지)

정답지는 **선별이 끝난 뒤에만** 본다. 그래서 파일을 따로 둔다.
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

SEED = 12345


def build(run_path: str, out_dir: str, root: str = ROOT,
          seed: int = SEED) -> dict:
    with open(os.path.join(root, run_path), encoding="utf-8") as fh:
        rec = json.load(fh)
    rows = rec.get("rows") or {}
    by_concept: dict = {}
    for arm, arm_rows in rows.items():
        for r in arm_rows:
            if r.get("verdict") != "PASS" or not r.get("svg"):
                continue
            by_concept.setdefault(r["concept"], []).append((arm, r["svg"]))

    rng = random.Random(seed)
    key, written = {}, 0
    base = os.path.join(root, out_dir, "candidates")
    for i, concept in enumerate(sorted(by_concept), 1):
        items = list(by_concept[concept])
        rng.shuffle(items)                    # 순서에서 티어를 지운다
        gdir = os.path.join(base, f"{i:02d}_{concept}")
        os.makedirs(gdir, exist_ok=True)
        for j, (arm, svg) in enumerate(items, 1):
            name = f"c{j:02d}.svg"
            with open(os.path.join(gdir, name), "w", encoding="utf-8",
                      newline="\n") as fh:
                fh.write(svg)
            key[f"{i:02d}_{concept}/{name}"] = arm
            written += 1
    return {"spec": "tier-blind-v0", "source": run_path, "seed": seed,
            "out_dir": out_dir, "written": written,
            "concepts": {c: len(v) for c, v in sorted(by_concept.items())},
            "key": key,
            "note": ("정답지다. 선별이 끝나기 전에 열면 그 회차는 오염된다.")}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--run", default="data/tier_compare_v0.json")
    ap.add_argument("--out", default="out/icons/tier-blind")
    ap.add_argument("--key", default="data/tier_blind_key.json")
    a = ap.parse_args(argv)
    res = build(a.run, a.out)
    with open(os.path.join(ROOT, a.key), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)
    print(f"블라인드 풀: {res['written']}개 후보 → {a.out}/candidates")
    thin = [c for c, n in res["concepts"].items() if n < 3]
    for c, n in res["concepts"].items():
        print(f"  {c}: {n}개" + ("  ← 얇다" if n < 3 else ""))
    if thin:
        print(f"\n후보가 3개 미만인 개념 {len(thin)}개 — 판이 얇습니다. "
              "예시를 켠 조건으로 한 번 더 뽑아야 제대로 된 판이 됩니다.")
    print(f"정답지: {a.key} (선별 뒤에 연다)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
