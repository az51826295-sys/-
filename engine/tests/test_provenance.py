"""출처 계약 골든 케이스 - 손으로 쓴 정답(expected.json)을 코드가
재현하는지 검사한다. 이 파일이 전부 통과하기 전에는 실로그 적용
금지 (1개월차 2주차 규칙)."""

import json
import os

from genesis.provenance import (
    aggregate, classify_document, classify_promotion)

FIX = os.path.join(os.path.dirname(__file__), "fixtures",
                   "provenance")


def load():
    with open(os.path.join(FIX, "cases.json"), encoding="utf-8") as f:
        cases = json.load(f)
    with open(os.path.join(FIX, "expected.json"),
              encoding="utf-8") as f:
        expected = json.load(f)
    return cases, expected


def test_golden_documents():
    cases, expected = load()
    cur = cases["current_parent_hashes"]
    for doc in cases["documents"]:
        want = expected["documents"][doc["case"]]
        got = classify_document(doc.get("header"), cur,
                                last_event_at=doc.get("last_event_at"))
        assert got.status == want["status"], doc["case"]
        assert got.in_aggregate == want["in_aggregate"], doc["case"]
        assert got.recheck_queue == want["recheck_queue"], doc["case"]
        if "violation" in want:
            assert got.violation == want["violation"], doc["case"]


def test_golden_promotions():
    cases, expected = load()
    cur = cases["current_parent_hashes"]
    for p in cases["promotions"]:
        want = expected["promotions"][p["case"]]
        got = classify_promotion(p["record"], cur)
        assert got.status == want["status"], p["case"]
        assert got.verifier == want["verifier"], p["case"]
        assert got.in_aggregate == want["in_aggregate"], p["case"]


def test_golden_aggregate():
    cases, expected = load()
    cur = cases["current_parent_hashes"]
    vs = [classify_document(d.get("header"), cur,
                            last_event_at=d.get("last_event_at"))
          for d in cases["documents"]]
    vs += [classify_promotion(p["record"], cur)
           for p in cases["promotions"]]
    agg = aggregate(vs)
    want = expected["aggregate"]
    assert agg["denominator"] == want["denominator"]
    assert agg["stale_rate"] == want["stale_rate"]
    assert agg["unknown_rate"] == want["unknown_rate"]
    assert agg["normative"] == want["normative"]
    assert agg["unknown_rate"] == want["unknown_rate"]


# ------- 계약의 모서리 (골든 밖, 규범 문서에서 직접 파생) -------


def test_missing_header_field_is_unknown():
    got = classify_document({"source_id": "x"}, {})
    assert got.status == "unknown" and not got.in_aggregate


def test_unknown_parent_is_unknown_not_stale():
    h = {"source_id": "d", "source_kind": "derived",
         "parent_ids": ["ghost"], "parent_hash": "abcd",
         "as_of": "t", "generator": "g", "status": None}
    got = classify_document(h, {})
    assert got.status == "unknown" and got.recheck_queue


def test_multi_parent_any_change_is_stale():
    h = {"source_id": "d", "source_kind": "derived",
         "parent_ids": ["p1", "p2"],
         "parent_hash": {"p1": "aa", "p2": "bb"},
         "as_of": "t", "generator": "g", "status": None}
    got = classify_document(h, {"p1": "aa", "p2": "CHANGED"})
    assert got.status == "stale"
    assert got.detail["changed_parent"] == "p2"


def test_aggregate_empty_is_defined():
    agg = aggregate([])
    assert agg["stale_rate"] is None and agg["unknown_rate"] is None
