"""U_saved 집계 골든 - 손 계산 정답을 코드가 재현해야 실표 적용."""

import json
import os

from genesis.ledger.usaved import aggregate

FIX = os.path.join(os.path.dirname(__file__), "fixtures",
                   "ledger_usaved")


def load(name):
    with open(os.path.join(FIX, name), encoding="utf-8") as f:
        return json.load(f)


def test_golden_usaved():
    rows = load("rows.json")
    expected = load("expected.json")
    got = aggregate(rows)
    for res in ("full", "local", "stat"):
        for key, want in expected[res].items():
            assert got[res][key] == want, f"{res}.{key}"
    assert got["wrong_block"] == expected["wrong_block"]
    assert got["unresolved"]["n"] == expected["unresolved"]["n"]
    assert got["unresolved"]["rate"] == expected["unresolved"]["rate"]
    assert got["unresolved"]["by_archetype"] == \
        expected["unresolved"]["by_archetype"]


def test_no_block_hits_is_defined():
    rows = load("rows.json")
    for r in rows:
        r["blocked"] = "NONE"
    got = aggregate(rows)
    assert got["wrong_block"]["rate"] is None


def test_archetype_never_a_key():
    """원형 기준 집계 금지 - 원형만 다른 두 행은 같은 키다."""
    rows = load("rows.json")[:2]
    rows[1] = dict(rows[1], sig_full="f1", sig_local="l1",
                   sig_stat="s1", archetype="improved")
    got = aggregate(rows)
    assert got["full"]["u_saved"] == 1
