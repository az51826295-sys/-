"""스테이지 1 ③: PR 후보 큐 CLI (genesis/rookery/engine/prqueue.py).

  python tools/pr_queue.py list --tags live_runB,live_runA      # 큐 생성·출력
  python tools/pr_queue.py mark live-toolz_496 submitted https://github.com/.../pull/634
  python tools/pr_queue.py summary --tags live_runB,live_runA   # 저장소별 집계

산출: data/pr_queue/queue.md (사람이 읽는 큐), data/pr_queue/queue.json,
상태: data/pr_queue_state.json. 제출은 언제나 사람이 한다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.getcwd())
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from genesis.rookery.engine import prqueue  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
STATE = os.path.join(DATA, "pr_queue_state.json")
OUT_DIR = os.path.join(DATA, "pr_queue")
FORK_OWNER = "az51826295-sys"
SLUG_OF = {
    "boltons": "mahmoud/boltons", "dateutil": "dateutil/dateutil",
    "marshmallow": "marshmallow-code/marshmallow",
    "more-itertools": "more-itertools/more-itertools",
    "sortedcontainers": "grantjenks/python-sortedcontainers",
    "tinydb": "msiemens/tinydb", "toolz": "pytoolz/toolz",
}
BASE_OF = {"marshmallow": "dev"}      # 나머지는 master


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd")
    p_list = sub.add_parser("list")
    p_list.add_argument("--tags", default="live_auto")
    p_list.add_argument("--all", action="store_true",
                        help="처리된 것도 표시")
    p_mark = sub.add_parser("mark")
    p_mark.add_argument("task_id")
    p_mark.add_argument("state", choices=prqueue.STATES)
    p_mark.add_argument("url", nargs="?", default="")
    p_mark.add_argument("--fixup", action="store_true",
                        help="사람 검토에서 산출물(코드)을 고쳤다 (Goodhart G-c)")
    p_sum = sub.add_parser("summary")
    p_sum.add_argument("--tags", default="live_auto")
    args = ap.parse_args(argv)
    cmd = args.cmd or "list"

    if cmd == "mark":
        state = prqueue.load_state(STATE)
        prqueue.mark(state, args.task_id, args.state, args.url,
                     fixup=args.fixup)
        prqueue.save_state(state, STATE)
        print(f"{args.task_id} -> {args.state} {args.url}"
              + (" [fixup]" if args.fixup else ""))
        return 0

    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    if cmd == "summary":
        rows = prqueue.summary(DATA, tags)
        print(json.dumps(rows, ensure_ascii=False, indent=1))
        return 0

    state = prqueue.load_state(STATE)
    cands = prqueue.collect(DATA, tags, os.path.join(DATA, "repos"),
                            SLUG_OF, FORK_OWNER, BASE_OF, state)
    os.makedirs(OUT_DIR, exist_ok=True)
    md = prqueue.render_markdown(cands, only_open=not args.all)
    with open(os.path.join(OUT_DIR, "queue.md"), "w", encoding="utf-8") as f:
        f.write(md)
    with open(os.path.join(OUT_DIR, "queue.json"), "w",
              encoding="utf-8") as f:
        json.dump([c.to_dict() for c in cands], f, ensure_ascii=False,
                  indent=1)
    print(md)
    print(f"저장: {os.path.join(OUT_DIR, 'queue.md')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
