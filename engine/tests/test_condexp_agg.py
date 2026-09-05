"""조건 실험 집계 골든 - 본실험 데이터 생성 전에 작성된 손 계산
정답의 재현 검사."""

import json
import os

from genesis.ledger.condexp_agg import (
    aggregate, bootstrap_ci, calls_per_success)

FIX = os.path.join(os.path.dirname(__file__), "fixtures",
                   "condexp_agg")


def load(name):
    with open(os.path.join(FIX, name), encoding="utf-8") as f:
        return json.load(f)


def test_golden_aggregate():
    rows = load("rows.json")
    expected = load("expected.json")
    got = aggregate(rows)
    for cond in ("1", "2"):
        for key, want in expected[cond].items():
            if key == "ci":
                continue
            assert got[cond][key] == want, f"C{cond}.{key}"


def test_zero_success_is_none_not_zero():
    rows = [{"seed": 1, "condition": "1", "calls": 64,
             "success": False, "rounds": []}]
    assert calls_per_success(rows) is None


def test_bootstrap_degenerate_ci_collapses_to_point():
    """전 런 동일 -> CI 상하한 = 점추정 (손 계산 가능한 골든)."""
    row = {"calls": 40, "success": True, "rounds": []}
    ci = bootstrap_ci([dict(row), dict(row), dict(row)])
    assert ci["lo"] == ci["hi"] == 40.0
    assert ci["skipped"] == 0


def test_bootstrap_skips_undefined_samples():
    rows = [{"calls": 40, "success": True, "rounds": []},
            {"calls": 64, "success": False, "rounds": []}]
    ci = bootstrap_ci(rows, rng_seed=1, n=200)
    assert ci["skipped"] > 0            # 성공 0 표본은 반드시 나온다
    assert ci["lo"] is not None
