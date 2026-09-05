"""ablation11 집계기 골든 검사 - 손 계산 정답(expected.json)을
코드가 정확히 재현해야 실로그 집계가 허용된다."""

import json
import os

from genesis.rookery.analyze_ablation import aggregate

FIX = os.path.join(os.path.dirname(__file__), "fixtures",
                   "ablation_agg")


def load(name):
    with open(os.path.join(FIX, name), encoding="utf-8") as f:
        return json.load(f)


def test_golden_aggregate():
    rows = load("rows.json")
    rounds = load("rounds.json")
    expected = load("expected.json")
    got = aggregate(rows, rounds, {"tX": {"src/a.py"}})
    for arm in ("BS", "BF"):
        for key, want in expected[arm].items():
            assert got[arm][key] == want, \
                f"{arm}.{key}: got {got[arm][key]!r}, want {want!r}"


def test_duplicate_candidates_count_in_revisit():
    """중복 후보도 재방문 분자·분모에 들어간다 - 같은 곳을 다시
    파는 행위 자체가 지표다."""
    rows = [{"task": "tX", "arm": "BF", "rep": 0,
             "final_status": "public_only",
             "candidates": [
                 {"call": 0, "files": ["src/z.py"], "code_fail": None,
                  "public_pass": False},
                 {"call": 1, "files": ["src/z.py"], "code_fail": None,
                  "public_pass": False, "duplicate": True},
             ]}]
    got = aggregate(rows, [], {"tX": {"src/a.py"}})
    assert got["BF"]["wrong_file_revisit_rate"] == 1.0


def test_empty_rounds_do_not_break_bs():
    rows = [{"task": "tX", "arm": "BS", "rep": 0,
             "final_status": "no_patch", "candidates": []}]
    got = aggregate(rows, [], {"tX": {"src/a.py"}})
    assert got["BS"]["hyp_generated"] == 0
    assert got["BS"]["candidates_total"] == 0
