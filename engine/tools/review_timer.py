"""사람 검토 시간 스톱워치 (docs/rookery-monetization-memo.md §6-v).

"30분→10분"은 가설이다. 단계별 **절대 시간**만 기록한다 - 개선폭 주장 금지.
단계: 판단(패치 읽기·맞는지) / 초안손질(회귀 테스트 import 합치기 등) /
Summary(PR 본문 한 문장) / 제출(푸시·PR) / 기타.

  python tools/review_timer.py start live-toolz_496 판단
  python tools/review_timer.py stop                      # 진행 중인 단계 종료
  python tools/review_timer.py report [--task live-toolz_496]

기록: data/review_times.jsonl (한 줄 = 한 단계: task, stage, start, end, sec).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(ROOT, "data", "review_times.jsonl")
OPEN = os.path.join(ROOT, "data", "review_timer_open.json")
STAGES = ("판단", "초안손질", "Summary", "제출", "기타")


def _load(path: str) -> list[dict]:
    rows = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    rows.append(json.loads(line))
    return rows


def start(task: str, stage: str, log: str = LOG, open_path: str = OPEN,
          now: float | None = None) -> dict:
    if stage not in STAGES:
        raise SystemExit(f"단계는 {STAGES} 중 하나")
    now = now if now is not None else time.time()
    if os.path.exists(open_path):
        stop(log, open_path, now)           # 이전 단계 자동 종료
    rec = {"task": task, "stage": stage, "start": now}
    with open(open_path, "w", encoding="utf-8") as f:
        json.dump(rec, f, ensure_ascii=False)
    return rec


def stop(log: str = LOG, open_path: str = OPEN,
         now: float | None = None) -> dict | None:
    if not os.path.exists(open_path):
        return None
    now = now if now is not None else time.time()
    with open(open_path, encoding="utf-8") as f:
        rec = json.load(f)
    rec["end"] = now
    rec["sec"] = round(now - rec["start"], 1)
    os.makedirs(os.path.dirname(log), exist_ok=True)
    with open(log, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    os.remove(open_path)
    return rec


def report(log: str = LOG, task: str | None = None) -> dict:
    rows = [r for r in _load(log) if not task or r["task"] == task]
    by_task: dict[str, dict] = {}
    for r in rows:
        t = by_task.setdefault(r["task"], {s: 0.0 for s in STAGES})
        t[r["stage"]] = t.get(r["stage"], 0.0) + r["sec"]
    for t in by_task.values():
        t["합계"] = round(sum(v for k, v in t.items() if k in STAGES), 1)
    return by_task


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd")
    s = sub.add_parser("start")
    s.add_argument("task")
    s.add_argument("stage", choices=STAGES)
    sub.add_parser("stop")
    r = sub.add_parser("report")
    r.add_argument("--task", default=None)
    args = ap.parse_args(argv)
    if args.cmd == "start":
        rec = start(args.task, args.stage)
        print(f"▶ {rec['task']} {rec['stage']} 시작")
    elif args.cmd == "stop":
        rec = stop()
        print(f"■ {rec['task']} {rec['stage']} {rec['sec']}초" if rec
              else "진행 중인 단계 없음")
    else:
        rep = report(task=args.task)
        for t, stages in rep.items():
            print(t, {k: (f"{v / 60:.1f}분" if k == "합계" else f"{v:.0f}s")
                      for k, v in stages.items() if v})
        if not rep:
            print("기록 없음")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
