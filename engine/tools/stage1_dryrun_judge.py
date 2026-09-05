"""스테이지 1 ④ 48h 목 드라이런 판정 (docs/stage1-dryrun48.md, 기준 동결).

  python tools/stage1_dryrun_judge.py                 # data/rookery.log + data/stage1_dry48
  python tools/stage1_dryrun_judge.py --hours 47.5 --tag stage1_dry48

관찰만 한다 - 아무것도 바꾸지 않는다.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
import time

sys.path.insert(0, os.getcwd())
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TS = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+ (\w+) (.*)$")


def parse_log(path: str) -> dict:
    beats, intakes, recoveries, errors = [], [], 0, []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            m = TS.match(line.rstrip("\n"))
            if not m:
                continue
            t = time.mktime(time.strptime(m.group(1), "%Y-%m-%d %H:%M:%S"))
            lvl, msg = m.group(2), m.group(3)
            if msg.startswith("heartbeat"):
                beats.append(t)
            elif msg.startswith("인테이크 실행"):
                rc = re.search(r"rc=(-?\d+)", msg)
                intakes.append(int(rc.group(1)) if rc else -1)
            elif "개 시작 (" in msg and msg.startswith("워커"):
                # 서비스 시작당 1회 찍힌다 ("시작 복구"는 저장소마다 한 줄 -
                # 다중 모드에서 7로 세이는 계측 결함을 08-22 중간 점검에서 수정)
                recoveries += 1
            if lvl == "ERROR" or "Traceback" in msg:
                errors.append(msg[:160])
    gaps = [b - a for a, b in zip(beats, beats[1:])]
    return {"first_beat": beats[0] if beats else None,
            "last_beat": beats[-1] if beats else None,
            "hours": ((beats[-1] - beats[0]) / 3600) if len(beats) > 1 else 0,
            "max_gap_min": (max(gaps) / 60) if gaps else 0,
            "beats": len(beats), "intake_runs": len(intakes),
            "intake_fail": sum(1 for rc in intakes if rc != 0),
            "recoveries": recoveries,       # = 서비스 시작 횟수
            "errors": errors}


def ledgers(data_root: str, tag: str) -> dict:
    import sqlite3
    out = {"usd": 0.0, "worker_exception": 0, "isolation_halt": 0,
           "auditor_halt": 0, "leased": 0, "pr_ready": 0, "tasks": 0,
           "repos": []}
    for db in sorted(glob.glob(os.path.join(data_root, tag, "*",
                                            "engine.db"))):
        c = sqlite3.connect(db)
        ev = lambda k: c.execute(  # noqa: E731
            "SELECT COUNT(*) FROM events WHERE kind=?", (k,)).fetchone()[0]
        usd = c.execute("SELECT COALESCE(SUM(usd),0) FROM reservations"
                        " WHERE state='settled'").fetchone()[0] or 0.0
        counts = dict(c.execute(
            "SELECT state, COUNT(*) FROM tasks GROUP BY state").fetchall())
        halt = c.execute("SELECT value FROM flags WHERE key='auditor_halt'"
                         ).fetchone()
        iso = c.execute("SELECT value FROM flags WHERE key='isolation_halt'"
                        ).fetchone()
        out["usd"] += float(usd)
        out["worker_exception"] += ev("worker_exception")
        out["isolation_halt"] += 1 if iso else 0
        out["auditor_halt"] += 1 if halt else 0
        out["leased"] += counts.get("leased", 0)
        out["pr_ready"] += ev("pr_ready")
        out["tasks"] += sum(counts.values())
        out["repos"].append({"db": db, "tasks": counts,
                             "usd": round(float(usd), 4),
                             "halted": bool(halt)})
        c.close()
    return out


def judge(log_stats: dict, led: dict, hours: float) -> list[tuple[str, bool, str]]:
    checks = [
        ("1 연속 운전 ≥%.1fh, 하트비트 간격 ≤15분, 재시작 0" % hours,
         log_stats["hours"] >= hours and log_stats["max_gap_min"] <= 15
         and log_stats["recoveries"] <= 1,
         f"{log_stats['hours']:.1f}h gap_max={log_stats['max_gap_min']:.1f}m "
         f"recoveries={log_stats['recoveries']}"),
        ("2 지출 0", led["usd"] == 0, f"usd={led['usd']}"),
        ("3 인테이크 ≥40회, 실패 ≤10%",
         log_stats["intake_runs"] >= 40 and
         log_stats["intake_fail"] <= 0.1 * max(log_stats["intake_runs"], 1),
         f"runs={log_stats['intake_runs']} fail={log_stats['intake_fail']}"),
        ("4 worker_exception 0, isolation_halt 0",
         led["worker_exception"] == 0 and led["isolation_halt"] == 0,
         f"exc={led['worker_exception']} iso={led['isolation_halt']} "
         f"auditor_halt={led['auditor_halt']} (감사 정지는 허용·부검)"),
        ("5 leased 0, pr_ready 0",
         led["leased"] == 0 and led["pr_ready"] == 0,
         f"leased={led['leased']} pr_ready={led['pr_ready']} "
         f"tasks={led['tasks']}"),
    ]
    return checks


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--log", default=os.path.join("data", "rookery.log"))
    ap.add_argument("--data", default="data")
    ap.add_argument("--tag", default="stage1_dry48")
    ap.add_argument("--hours", type=float, default=47.5)
    args = ap.parse_args(argv)
    ls = parse_log(args.log) if os.path.exists(args.log) else {
        "hours": 0, "max_gap_min": 0, "beats": 0, "intake_runs": 0,
        "intake_fail": 0, "recoveries": 0, "errors": ["log missing"],
        "first_beat": None, "last_beat": None}
    led = ledgers(args.data, args.tag)
    checks = judge(ls, led, args.hours)
    ok = all(c[1] for c in checks)
    for name, passed, detail in checks:
        print(("PASS " if passed else "FAIL ") + name + " — " + detail)
    print("errors:", len(ls["errors"]), ls["errors"][:5])
    print("VERDICT:", "통과" if ok else "미달")
    print(json.dumps({"log": {k: v for k, v in ls.items() if k != "errors"},
                      "ledgers": {k: v for k, v in led.items()
                                  if k != "repos"}},
                     ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
