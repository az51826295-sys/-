"""실측 결말 → 라우팅 v2 시드 (docs/routing-v2-design.md).

v2는 가격이 있는 결말만 경험으로 쓴다. 오늘 원장들의 agent_outcome
이벤트(usd 포함)를 모아 새 원장에 시딩할 파일을 만든다. 시딩은 선택
(라우팅)에만 작용한다 - 프롬프트 불주입(출처 계약 8항). 배치 러너는
``tools/live_run0.py --seed <파일>`` 로 읽는다 (상주 서비스의 시드 훅은
드라이런 후 안건).

  python tools/extract_ledger_seed.py --tags live_runB,live_runA --out data/ledger_seed_v2.json
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sqlite3
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def extract(data_root: str, tags: list[str]) -> list[dict]:
    out = []
    for tag in tags:
        for db in sorted(glob.glob(os.path.join(data_root, tag, "*",
                                                "engine.db"))):
            c = sqlite3.connect(db)
            c.row_factory = sqlite3.Row
            for r in c.execute(
                    "SELECT task_id, run_id, data FROM events"
                    " WHERE kind='agent_outcome' AND task_id IS NOT NULL"
                    " ORDER BY id"):
                d = json.loads(r["data"])
                if d.get("usd") is None:
                    # 결말에 가격이 없으면 reservations에서 복원 (v2 이전 원장)
                    usd = c.execute(
                        "SELECT COALESCE(SUM(usd),0) FROM reservations"
                        " WHERE task_id=? AND run_id=? AND state='settled'",
                        (r["task_id"], r["run_id"])).fetchone()[0]
                    d["usd"] = round(float(usd or 0.0), 6)
                d["_from"] = f"{tag}/{os.path.basename(os.path.dirname(db))}"
                d["_task"] = r["task_id"]
                out.append(d)
            c.close()
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tags", required=True)
    ap.add_argument("--out", default=os.path.join(DATA, "ledger_seed_v2.json"))
    args = ap.parse_args(argv)
    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    rows = extract(DATA, tags)
    seed = {"extracted_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "protocol": "docs/routing-v2-design.md", "tags": tags,
            "outcomes": [{k: v for k, v in r.items()
                          if not k.startswith("_")} for r in rows]}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(seed, f, ensure_ascii=False, indent=1)
    by = {}
    for r in rows:
        k = (r["tier"], r["attempt"])
        b = by.setdefault(k, {"n": 0, "wins": 0, "usd": 0.0})
        b["n"] += 1
        b["wins"] += 1 if r["accepted"] else 0
        b["usd"] += r["usd"]
    for (tier, att), b in sorted(by.items()):
        print(f"{tier} attempt{att}: n={b['n']} wins={b['wins']} "
              f"mean_usd={b['usd'] / b['n']:.3f}")
    print(f"saved {len(rows)} outcomes -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
