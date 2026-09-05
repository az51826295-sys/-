"""실로그 적용기 검사: 헤더 왕복, 원로그 as_of, 스캔 판정 연동.
판정·집계 자체는 골든(test_provenance)이 지키고, 여기는 입출력만."""

import json
import os

from genesis.provenance_scan import (
    HEADER_RE, parse_header, raw_as_of, render_header, sha12)


HEADER = {"source_id": "docs/x.md", "source_kind": "derived",
          "parent_ids": ["data/a.json"],
          "parent_hash": {"data/a.json": "abc123def456"},
          "as_of": "2026-08-08T15:00:00",
          "generator": "tools/x.py", "status": None}


def test_header_round_trip(tmp_path):
    p = tmp_path / "doc.md"
    p.write_text(render_header(HEADER) + "# 본문\n", encoding="utf-8")
    got = parse_header(str(p))
    assert got == HEADER


def test_no_header_returns_none(tmp_path):
    p = tmp_path / "doc.md"
    p.write_text("# 그냥 문서\n", encoding="utf-8")
    assert parse_header(str(p)) is None


def test_malformed_header_flagged(tmp_path):
    p = tmp_path / "doc.md"
    p.write_text("<!-- provenance: {깨진 json} -->\n# 문서\n",
                 encoding="utf-8")
    got = parse_header(str(p))
    assert got == {"_malformed": True}


def test_header_regex_requires_top_of_file():
    text = "# 제목\n<!-- provenance: {} -->"
    assert HEADER_RE.match(text) is None


def test_jsonl_as_of_uses_last_event_ts(tmp_path):
    p = tmp_path / "log.jsonl"
    rows = [{"ts": 1754000000.0}, {"ts": 1754600000.0}]
    p.write_text("\n".join(json.dumps(r) for r in rows),
                 encoding="utf-8")
    got = raw_as_of(str(p))
    assert "~mtime" not in got          # 기록 자체에서 뽑았다
    import time
    assert got == time.strftime("%Y-%m-%dT%H:%M:%S",
                                time.localtime(1754600000.0))


def test_jsonl_without_ts_falls_back_to_mtime(tmp_path):
    p = tmp_path / "log.jsonl"
    p.write_text('{"a": 1}\n', encoding="utf-8")
    assert raw_as_of(str(p)).endswith("~mtime")


def test_sha12_stable(tmp_path):
    p = tmp_path / "f.bin"
    p.write_bytes(b"content")
    assert sha12(str(p)) == sha12(str(p))
    assert len(sha12(str(p))) == 12
