"""운영자 CLI (docs/rookery-ops-runbook.md).

  python tools/ops.py status --tags live_auto            # 저장소별 큐·정지·백오프·지출
  python tools/ops.py resume --tag live_auto --repo boltons --by 사장님
  python tools/ops.py clear-backoff --tag live_auto --repo boltons

resume은 감사 정지(auditor_halt)·격리 정지(isolation_halt)를 **사람 이름을
적고** 푼다 - 엔진은 스스로 풀지 않는다(내구 정지 제도). 해제 전에 정지
사유(status 출력)를 읽고 부검을 끝냈는지 확인하라.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.getcwd())
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from genesis.rookery.engine.auditor import (  # noqa: E402
    HALT_FLAG, ISOLATION_HALT_FLAG, Auditor)
from genesis.rookery.engine.store import Store  # noqa: E402
from genesis.rookery.engine.worker import (  # noqa: E402
    INFRA_BACKOFF_FLAG, INFRA_CONSEC_FLAG)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def ledgers(data_root: str, tags: list[str]):
    for tag in tags:
        root = os.path.join(data_root, tag)
        if not os.path.isdir(root):
            continue
        for name in sorted(os.listdir(root)):
            db = os.path.join(root, name, "engine.db")
            if os.path.isfile(db):
                yield tag, name, db


def status(data_root: str, tags: list[str]) -> list[dict]:
    out = []
    for tag, name, db in ledgers(data_root, tags):
        store = Store(db)
        try:
            counts = store.counts()
            usd = store.conn.execute(
                "SELECT COALESCE(SUM(usd),0) FROM reservations"
                " WHERE state='settled'").fetchone()[0] or 0.0
            backoff = store.get_flag(INFRA_BACKOFF_FLAG)
            row = {"tag": tag, "repo": name,
                   "pending": counts.get("pending", 0),
                   "leased": counts.get("leased", 0),
                   "succeeded": counts.get("succeeded", 0),
                   "failed": counts.get("failed", 0),
                   "usd": round(float(usd), 3),
                   "auditor_halt": store.get_flag(HALT_FLAG),
                   "isolation_halt": store.get_flag(ISOLATION_HALT_FLAG),
                   "infra_backoff_until": (
                       time.strftime("%Y-%m-%d %H:%M:%S",
                                     time.localtime(float(backoff)))
                       if backoff and float(backoff) > time.time()
                       else None),
                   "infra_consec": store.get_flag(INFRA_CONSEC_FLAG, 0)}
        finally:
            store.close()
        out.append(row)
    return out


def resume(data_root: str, tag: str, repo: str, who: str) -> dict:
    db = os.path.join(data_root, tag, repo, "engine.db")
    if not os.path.isfile(db):
        raise SystemExit(f"원장 없음: {db}")
    store = Store(db)
    try:
        before = {"auditor_halt": store.get_flag(HALT_FLAG),
                  "isolation_halt": store.get_flag(ISOLATION_HALT_FLAG)}
        Auditor(store).resume(who=who)          # auditor_halt 해제 + 이벤트
        if store.get_flag(ISOLATION_HALT_FLAG):
            store.clear_flag(ISOLATION_HALT_FLAG)
            store.log(None, None, "isolation_resume", {"by": who})
        after = {"auditor_halt": store.get_flag(HALT_FLAG),
                 "isolation_halt": store.get_flag(ISOLATION_HALT_FLAG)}
    finally:
        store.close()
    return {"before": before, "after": after, "by": who}


def clear_backoff(data_root: str, tag: str, repo: str) -> None:
    db = os.path.join(data_root, tag, repo, "engine.db")
    store = Store(db)
    try:
        store.clear_flag(INFRA_BACKOFF_FLAG)
        store.set_flag(INFRA_CONSEC_FLAG, 0)
        store.log(None, None, "infra_backoff_cleared", {"by": "operator"})
    finally:
        store.close()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd")
    p = sub.add_parser("status")
    p.add_argument("--tags", default="live_auto")
    p.add_argument("--data", default=DATA)
    r = sub.add_parser("resume")
    r.add_argument("--tag", required=True)
    r.add_argument("--repo", required=True)
    r.add_argument("--by", required=True, help="해제한 사람 (원장에 남는다)")
    r.add_argument("--data", default=DATA)
    c = sub.add_parser("clear-backoff")
    c.add_argument("--tag", required=True)
    c.add_argument("--repo", required=True)
    c.add_argument("--data", default=DATA)
    args = ap.parse_args(argv)
    if args.cmd == "resume":
        print(json.dumps(resume(args.data, args.tag, args.repo, args.by),
                         ensure_ascii=False, indent=1))
        return 0
    if args.cmd == "clear-backoff":
        clear_backoff(args.data, args.tag, args.repo)
        print("backoff cleared")
        return 0
    tags = [t.strip() for t in (args.tags if args.cmd else "live_auto"
                                ).split(",") if t.strip()]
    rows = status(getattr(args, "data", DATA), tags)
    for row in rows:
        flags = []
        if row["auditor_halt"]:
            flags.append("***감사정지***")
        if row["isolation_halt"]:
            flags.append("***격리정지***")
        if row["infra_backoff_until"]:
            flags.append(f"백오프~{row['infra_backoff_until']}")
        print(f"{row['tag']}/{row['repo']}: pending {row['pending']} "
              f"leased {row['leased']} ok {row['succeeded']} "
              f"fail {row['failed']} ${row['usd']} {' '.join(flags)}")
        if row["auditor_halt"]:
            print("   사유:", json.dumps(row["auditor_halt"],
                                      ensure_ascii=False)[:300])
    print(json.dumps(rows, ensure_ascii=False)[:2000] if not rows else "")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
