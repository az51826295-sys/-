"""출처 계약 v0의 실로그 적용기 (3주차).

- 원로그(raw): data/의 1차 기록 파일. 헤더를 갖지 않는다 — 스캐너가
  경로를 source_id로, 내용 sha1을 해시로, 기록 자체의 마지막 이벤트
  시각을 as_of로 기계 산출해 인벤토리를 만든다.
- 파생(derived): docs/*.md. 문서 상단 HTML 주석 헤더를 파싱한다:
      <!-- provenance: {...계약 7필드 JSON...} -->
  헤더 직렬화 형식은 구현 선택이며 스키마 필드 변경이 아니다
  (계약 7항의 개정 대상 아님 — 필드 집합은 그대로).
- 판정·집계는 골든 통과된 genesis.provenance만 쓴다. 이 모듈은
  입출력(발굴·파싱·해시)만 담당한다.

  python -m genesis.provenance_scan          # 스캔 + 첫 측정 저장
"""

from __future__ import annotations

import glob
import hashlib
import json
import os
import re
import sqlite3
import time

from genesis.provenance import (
    aggregate, classify_document)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(DATA, "provenance_scan.json")

HEADER_RE = re.compile(r"^<!--\s*provenance:\s*(\{.*?\})\s*-->",
                       re.S)

RAW_PATTERNS = [
    "*.jsonl", "*.db", "*_registry.json", "*_report.json",
    "*_report_*.json", "*_admission.json", "*_diagnosis.json",
    "*_verdict.json", "*_runlog_*.json", "barrier_recount.json",
]

# 이름 규칙 밖이지만 **문서가 실제로 인용하는 기록이 사는 곳**(계약 §6).
# 2026-08-26: 이 목록이 없어서 골든 결과·선별 기록을 부모로 적은 문서가
# "부모 없음"으로 강등됐다 - 근거를 못 찾는 계기판은 계기판이 아니다.
# data/repos/ 같은 큰 디렉터리는 넣지 않는다(클론이고 인용 대상이 아니다).
RAW_DIRS = ["goldens", "picks", "observed"]


def sha12(path: str) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:12]


def _iso(ts: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(ts))


def raw_as_of(path: str) -> str:
    """원로그의 as_of = 마지막 이벤트 시각. 기록 자체에서 뽑을 수
    있으면 그것을, 없으면 파일 mtime을 대리로 쓰고 표시한다."""
    if path.endswith(".db"):
        try:
            db = sqlite3.connect(path)
            for table, col in (("events", "ts"), ("runs", "ended_at")):
                try:
                    row = db.execute(
                        f"SELECT MAX({col}) FROM {table}").fetchone()
                    if row and row[0]:
                        db.close()
                        return _iso(float(row[0]))
                except sqlite3.Error:
                    continue
            db.close()
        except sqlite3.Error:
            pass
    if path.endswith(".jsonl"):
        try:
            last = None
            with open(path, encoding="utf-8", errors="replace") as f:
                for line in f:
                    if line.strip():
                        last = line
            if last:
                e = json.loads(last)
                for key in ("ts", "time", "ended_at"):
                    if isinstance(e.get(key), (int, float)):
                        return _iso(float(e[key]))
        except (OSError, json.JSONDecodeError):
            pass
    return _iso(os.path.getmtime(path)) + "~mtime"


def raw_inventory() -> dict[str, dict]:
    """source_id(저장소 상대 경로, /) -> {hash, as_of}."""
    seen: dict[str, dict] = {}
    paths = [p for pat in RAW_PATTERNS
             for p in glob.glob(os.path.join(DATA, "**", pat), recursive=True)]
    for sub in RAW_DIRS:                        # 판정 기록 디렉터리는 통째로
        paths += glob.glob(os.path.join(DATA, sub, "**", "*.json"),
                           recursive=True)
    for p in paths:
        rel = os.path.relpath(p, ROOT).replace("\\", "/")
        if rel in seen:
            continue
        try:
            seen[rel] = {"hash": sha12(p), "as_of": raw_as_of(p)}
        except OSError:
            continue
    return seen


def parse_header(md_path: str) -> dict | None:
    try:
        with open(md_path, encoding="utf-8", errors="replace") as f:
            head = f.read(8192)
    except OSError:
        return None
    m = HEADER_RE.match(head.lstrip("﻿\n"))
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return {"_malformed": True}


def render_header(header: dict) -> str:
    return ("<!-- provenance: "
            + json.dumps(header, ensure_ascii=False) + " -->\n")


def scan() -> dict:
    inv = raw_inventory()
    cur_hashes = {sid: v["hash"] for sid, v in inv.items()}
    docs = []
    verdicts = []
    for p in sorted(glob.glob(os.path.join(DOCS, "*.md"))):
        rel = os.path.relpath(p, ROOT).replace("\\", "/")
        header = parse_header(p)
        if header is not None and header.get("_malformed"):
            header = None                    # 깨진 헤더 = 헤더 없음
        v = classify_document(header, cur_hashes)
        verdicts.append(v)
        docs.append({"doc": rel,
                     "has_header": header is not None,
                     "status": v.status,
                     "recheck": v.recheck_queue,
                     "violation": v.violation,
                     "detail": v.detail})
    agg = aggregate(verdicts)
    return {"scanned_at": _iso(time.time()),
            "raw_sources": len(inv),
            "raw_inventory": inv,
            "documents": docs,
            "aggregate": agg}


def main() -> int:
    result = scan()
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    a = result["aggregate"]
    print(f"원로그 {result['raw_sources']}개 인벤토리")
    print(f"문서 {a['total']}건: fresh {a['fresh']} / stale "
          f"{a['stale']} / unknown {a['unknown']} / normative "
          f"{a.get('normative', 0)}")
    print(f"stale률 {a['stale_rate']} (분모 {a['denominator']}), "
          f"unknown률 {a['unknown_rate']}")
    for d in result["documents"]:
        if d["status"] != "unknown":
            print(f"  {d['status']:6} {d['doc']}"
                  + (f" ({d['violation']})" if d["violation"] else ""))
    print(f"저장: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
