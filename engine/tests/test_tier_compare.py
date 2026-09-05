"""티어 비교 — 등록 문서와 코드가 어긋나지 않게, 그리고 판이 오염되지 않게.

두 가지를 지킨다:
1. 표본 단위는 **호출**이다. 후보로 세면 정밀도가 부풀고, 그건 어젯밤 이미
   한 번 판정을 뒤집었다(docs/measurement-rules.md §1).
2. 블라인드 판에 **티어가 새면** "더 예쁜가"의 답이 오염된다.
"""
import json
import os

from tools import blind_pool
from tools import icon_lane_run as ilr
from tools import tier_compare as tc

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESIGN = os.path.join(ROOT, "docs", "tier-compare-v0-design.md")


def test_thresholds_and_arms_match_the_registered_design():
    text = open(DESIGN, encoding="utf-8").read()
    assert tc.TIER_HELPS_LOWER == 0.20 and "0.20" in text
    assert tc.IRRELEVANT_BAND == 0.05 and "±0.05" in text
    assert tc.MIN_CALLS_PER_ARM == 18 and "팔당 호출 ≥ 18" in text
    assert tc.MIN_CONCEPTS == 8 and "개념 ≥ 8" in text
    for _name, model in tc.ARMS:
        assert model in text, model
    assert tc.BASELINE == "haiku"


def test_thresholds_are_inherited_from_the_prompt_control():
    from tools import prompt_ablation as pa
    assert tc.TIER_HELPS_LOWER == pa.SPEC_HELPS_LOWER
    assert tc.IRRELEVANT_BAND == pa.IRRELEVANT_UPPER


def _arm(rates: list, concepts: int = 9) -> dict:
    calls = [{"concept": f"c{i % concepts}", "n": 6,
              "passed": int(round(r * 6)), "rate": r}
             for i, r in enumerate(rates)]
    return {"calls": calls, "n_calls": len(calls), "rows": [],
            "concepts": [f"c{i}" for i in range(concepts)],
            "pass_rate": sum(rates) / len(rates), "why": None}


def test_a_clear_win_is_named():
    j = tc.verdict(_arm([0.9] * 18), _arm([0.1] * 18))
    assert j["verdict"] == "tier_helps"


def test_no_difference_is_named():
    j = tc.verdict(_arm([0.5] * 18), _arm([0.5] * 18))
    assert j["verdict"] == "tier_irrelevant"


def test_too_few_calls_is_undefined():
    j = tc.verdict(_arm([0.9] * 6), _arm([0.1] * 6))
    assert j["verdict"] == "undefined" and j["why"] == "sample_gate"


def test_temperature_is_dropped_only_for_models_that_reject_it():
    cls = ilr.AnthropicIconProposer
    for model, expect in (("claude-haiku-4-5", True),
                          ("claude-sonnet-5", False),
                          ("claude-opus-5", False)):
        sends = not any(model.startswith(p)
                        for p in cls.NO_TEMPERATURE_PREFIXES)
        assert sends is expect, model


def test_the_blind_pool_hides_the_tier(tmp_path):
    run = tmp_path / "run.json"
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
           'fill="none" stroke="currentColor" stroke-width="1.5" '
           'stroke-linecap="round" stroke-linejoin="round">'
           '<path d="M4 4 L20 20"/></svg>')
    rows = {arm: [{"concept": "save", "verdict": "PASS", "svg": svg,
                   "violated": []} for _ in range(2)]
            for arm in ("haiku", "sonnet", "opus")}
    run.write_text(json.dumps({"rows": rows}), encoding="utf-8")
    res = blind_pool.build(str(run), "pool", root=str(tmp_path))
    assert res["written"] == 6
    # 사람이 보는 쪽에는 티어가 한 글자도 없어야 한다
    base = tmp_path / "pool" / "candidates"
    for gdir in base.iterdir():
        for f in gdir.iterdir():
            assert not any(t in f.name for t in ("haiku", "sonnet", "opus"))
            body = f.read_text(encoding="utf-8")
            assert not any(t in body for t in ("haiku", "sonnet", "opus"))
    # 정답지는 따로 있고, 그건 선별 뒤에 본다
    assert set(res["key"].values()) == {"haiku", "sonnet", "opus"}
    assert "정답지" in res["note"]


def test_the_blind_shuffle_is_reproducible(tmp_path):
    run = tmp_path / "run.json"
    svgs = {arm: [{"concept": "save", "verdict": "PASS",
                   "svg": f"<svg>{arm}{i}</svg>", "violated": []}
                  for i in range(3)] for arm in ("haiku", "sonnet", "opus")}
    run.write_text(json.dumps({"rows": svgs}), encoding="utf-8")
    a = blind_pool.build(str(run), "p1", root=str(tmp_path))
    b = blind_pool.build(str(run), "p2", root=str(tmp_path))
    assert list(a["key"].values()) == list(b["key"].values())
