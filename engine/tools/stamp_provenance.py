"""파생 문서에 출처 헤더를 찍는다 (계약 v0).

  python tools/stamp_provenance.py docs/x.md data/a.json data/b.jsonl
  python tools/stamp_provenance.py --normative docs/x-design.md [docs/y.md ...]

첫 인자가 문서, 나머지가 부모 원로그. 기존 헤더가 있으면 교체.
as_of = 지금(부모 확인 시점), generator = 이 도구 경로.
--normative (계약 v0.1 §5): 부모 없는 규범 문서. as_of = 그 문서의
마지막 git 커밋 시각(없으면 지금).
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))
from genesis.provenance_scan import HEADER_RE, render_header, sha12

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _git_last_commit_iso(path: str) -> str | None:
    import subprocess
    r = subprocess.run(["git", "log", "-1", "--format=%cd",
                        "--date=format:%Y-%m-%dT%H:%M:%S", "--", path],
                       cwd=ROOT, capture_output=True, text=True)
    out = (r.stdout or "").strip()
    return out or None


def _write(doc: str, header: dict) -> None:
    with open(doc, encoding="utf-8") as f:
        body = f.read()
    m = HEADER_RE.match(body.lstrip("\ufeff\n"))
    if m:
        body = body[body.index("-->") + 4:].lstrip("\n")
    with open(doc, "w", encoding="utf-8", newline="\n") as f:
        f.write(render_header(header) + body)


def main() -> int:
    rel = lambda p: os.path.relpath(  # noqa: E731
        os.path.abspath(p), ROOT).replace("\\", "/")
    if len(sys.argv) > 1 and sys.argv[1] == "--normative":
        docs = sys.argv[2:]
        if not docs:
            print("규범 문서를 1개 이상 지정하라")
            return 1
        for doc in docs:
            header = {
                "source_id": rel(doc), "source_kind": "normative",
                "parent_ids": [], "parent_hash": {},
                "as_of": _git_last_commit_iso(rel(doc))
                or time.strftime("%Y-%m-%dT%H:%M:%S"),
                "generator": "tools/stamp_provenance.py --normative",
                "status": None}
            _write(doc, header)
            print(f"stamped normative: {rel(doc)} as_of={header['as_of']}")
        return 0
    doc = sys.argv[1]
    parents = sys.argv[2:]
    if not parents:
        print("부모 원로그를 1개 이상 지정하라")
        return 1
    header = {
        "source_id": rel(doc),
        "source_kind": "derived",
        "parent_ids": [rel(p) for p in parents],
        "parent_hash": {rel(p): sha12(p) for p in parents},
        "as_of": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "generator": "tools/stamp_provenance.py",
        "status": None}
    with open(doc, encoding="utf-8") as f:
        body = f.read()
    m = HEADER_RE.match(body.lstrip("﻿\n"))
    if m:
        body = body[body.index("-->") + 4:].lstrip("\n")
    with open(doc, "w", encoding="utf-8", newline="\n") as f:
        f.write(render_header(header) + body)
    print(f"stamped: {rel(doc)} <- {len(parents)} parents")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
