"""U_saved · U_calls 집계 (규칙 문서 4항의 기계 구현).

- 조회 키 기준으로만 집계한다. 원형(archetype) 기준 집계 금지.
- U_saved = Σ_k max(0, n_k − 1), U_calls = U_saved × c_k (c_k = 8,
  낙관 상한 관례 - 규칙 문서 4항).
- 오차단률 = BLOCK 판정을 받은 행 중 실제로는 성공(failed=False)
  이었던 비율 - 재매칭률과의 균형점 판단 재료.
- unresolved = outcome이 없는 행. 분류(원형)별 분리 보고.

골든(tests/fixtures/ledger_usaved/) 통과 전 실표 적용 금지.

  python -m genesis.ledger.usaved
"""

from __future__ import annotations

import json
import os
from collections import Counter

from genesis.ledger.state import RESOLUTIONS

DATA = "data"
C_K = 8
TABLE = os.path.join(DATA, "ledger_boardgame_table.jsonl")
OUT = os.path.join(DATA, "ledger_usaved.json")
T_EXP = 2560                       # 규칙 문서 5항의 동결 임계값


def aggregate(rows: list[dict]) -> dict:
    out: dict = {"n_rows": len(rows), "c_k": C_K}
    for res in RESOLUTIONS:
        counts = Counter((r[f"sig_{res}"], r["phase"], r["action"])
                         for r in rows)
        u_saved = sum(n - 1 for n in counts.values() if n > 1)
        out[res] = {
            "unique_keys": len(counts),
            "u_saved": u_saved,
            "u_calls": u_saved * C_K,
        }
    block_rows = [r for r in rows if r.get("blocked") == "BLOCK"]
    wrong = sum(1 for r in block_rows if not r.get("failed"))
    out["wrong_block"] = {
        "block_hits": len(block_rows), "wrong": wrong,
        "rate": round(wrong / len(block_rows), 4)
        if block_rows else None,
    }
    unresolved = [r for r in rows if r.get("outcome") is None]
    out["unresolved"] = {
        "n": len(unresolved),
        "rate": round(len(unresolved) / len(rows), 4) if rows else None,
        "by_archetype": dict(Counter(
            r.get("archetype", "?") for r in unresolved)),
    }
    return out


def main() -> int:
    rows = []
    with open(TABLE, encoding="utf-8") as f:
        for line in f:
            rows.append(json.loads(line))
    out = aggregate(rows)
    out["threshold"] = {
        "t_exp": T_EXP,
        "verdict_by_resolution": {
            res: ("PASS" if out[res]["u_calls"] >= T_EXP else "FAIL")
            for res in RESOLUTIONS}}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"저장: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
