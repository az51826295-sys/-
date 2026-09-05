"""모델 티어 비교 (docs/tier-compare-v0-design.md).

  python -X utf8 tools/tier_compare.py --provider mock
  GENESIS_SPEND=i-approve python -X utf8 tools/tier_compare.py \\
      --provider anthropic --max-usd 2.00

세 팔은 **모델만** 다르다. 조건은 예시 0개(세트의 첫 아이콘 상황) — haiku가
0.018로 바닥이라 개선 여지가 가장 큰 자리다. 표본 단위는 **호출**이다.

기계는 규격만 판정한다. "더 예쁜가"는 §5의 블라인드 판으로 사장님이 답한다.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import svg_raster                           # noqa: E402
from tools import diversity_curve as dcv                 # noqa: E402
from tools import example_dose as ed                     # noqa: E402
from tools import icon_judge                             # noqa: E402
from tools import icon_lane_run as ilr                   # noqa: E402

# 문턱은 프롬프트 통제에서 그대로 상속한다(새 숫자 없음)
TIER_HELPS_LOWER = 0.20
IRRELEVANT_BAND = 0.05
MIN_CALLS_PER_ARM = 18
MIN_CONCEPTS = 8

BOOTSTRAP_N = 10000
BOOTSTRAP_SEED = 12345
N_PER_CALL = 6
TEMPERATURE = 1.0
REPEATS = 2

ARMS = (("haiku", "claude-haiku-4-5"),
        ("sonnet", "claude-sonnet-5"),
        ("opus", "claude-opus-5"))
BASELINE = "haiku"


def run_arm(provider, doc: dict, concepts: list, repeats: int) -> dict:
    """개념마다 `repeats`회 호출. 예시 0개, 라운드 1, 중복 안 버림."""
    calls, rows, why = [], [], None
    plan = [(i, c) for i, c in enumerate(concepts, 1) for _ in range(repeats)]
    for i, item in plan:
        prompt = ilr.initial_prompt(item["concept"], item["meaning"], "tier",
                                    i, [], doc, N_PER_CALL)
        ilr._assert_no_hidden_leak(prompt, doc)
        temp = min(TEMPERATURE, getattr(provider, "max_temperature", 2.0))
        try:
            raw = provider.generate(ilr.SYSTEM_PROMPT, prompt, temp, N_PER_CALL)
        except ilr.BudgetExhausted as exc:
            why = str(exc)
            break
        except Exception as exc:                  # 400 등을 삼키지 않는다
            why = f"{type(exc).__name__}: {exc}"
            break
        call_rows = []
        for svg in ilr.split_candidates(raw):
            res = icon_judge.judge_svg(svg, doc)
            call_rows.append({
                "concept": item["concept"], "verdict": res["verdict"],
                "violated": sorted(r["rule"] for r in res["rules"]
                                   if r["ok"] is False and not r.get("hidden")),
                "signatures": dcv.signatures(svg), "svg": svg})
        rows += call_rows
        n_pass = sum(1 for r in call_rows if r["verdict"] == "PASS")
        calls.append({"concept": item["concept"], "n": len(call_rows),
                      "passed": n_pass,
                      "rate": n_pass / len(call_rows) if call_rows else None})
    passed = [r for r in rows if r["verdict"] == "PASS"]
    return {"calls": calls, "n_calls": len(calls), "rows": rows,
            "n": len(rows), "passed": len(passed),
            "pass_rate": len(passed) / len(rows) if rows else None,
            "concepts": sorted({r["concept"] for r in rows}),
            "why": why,
            "temperature_dropped": getattr(provider, "temperature_dropped",
                                           False)}


def _boot_diff(a: list, b: list) -> tuple:
    if not a or not b:
        return (None, None)
    rng = random.Random(BOOTSTRAP_SEED)
    diffs = []
    for _ in range(BOOTSTRAP_N):
        ra = sum(a[rng.randrange(len(a))] for _ in range(len(a))) / len(a)
        rb = sum(b[rng.randrange(len(b))] for _ in range(len(b))) / len(b)
        diffs.append(ra - rb)
    diffs.sort()
    return (diffs[int(0.025 * (BOOTSTRAP_N - 1))],
            diffs[int(0.975 * (BOOTSTRAP_N - 1))])


def verdict(arm: dict, base: dict) -> dict:
    """설계 §3. 호출 단위."""
    a = [c["rate"] for c in arm["calls"] if c["rate"] is not None]
    b = [c["rate"] for c in base["calls"] if c["rate"] is not None]
    gate = (len(a) >= MIN_CALLS_PER_ARM and len(b) >= MIN_CALLS_PER_ARM
            and len(arm["concepts"]) >= MIN_CONCEPTS)
    if not a or not b:
        return {"verdict": "undefined", "why": "empty_arm", "d": None,
                "ci95": [None, None], "gate_ok": False}
    d = sum(a) / len(a) - sum(b) / len(b)
    lo, hi = _boot_diff(a, b)
    if not gate:
        v, why = "undefined", "sample_gate"
    elif lo > TIER_HELPS_LOWER:
        v, why = "tier_helps", "ci_lower_gt_threshold"
    elif abs(lo) <= IRRELEVANT_BAND and abs(hi) <= IRRELEVANT_BAND:
        v, why = "tier_irrelevant", "ci_within_band"
    else:
        v, why = "undefined", "ci_straddles"
    return {"verdict": v, "why": why, "d": d, "ci95": [lo, hi],
            "gate_ok": gate, "n_calls": len(a)}


def extras(arm: dict) -> dict:
    """판정이 아니라 기술 통계(설계 §4)."""
    rules: dict = {}
    for r in arm["rows"]:
        for rule in r["violated"]:
            rules[rule] = rules.get(rule, 0) + 1
    passed = [r for r in arm["rows"] if r["verdict"] == "PASS"]
    sigs = [r["signatures"]["T2"] for r in passed]
    weights = ([svg_raster.optical_weight(r["svg"]) for r in passed]
               if svg_raster.available() else [])
    return {"violations": dict(sorted(rules.items(), key=lambda kv: -kv[1])),
            "distinct_T2": len(set(sigs)), "passed": len(passed),
            "weight_spread": (max(weights) - min(weights)
                              if len(weights) >= 2 else None)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--provider", default="mock")
    ap.add_argument("--max-usd", type=float, default=2.00)
    ap.add_argument("--repeats", type=int, default=REPEATS)
    ap.add_argument("--out", default="data/tier_compare_v0.json")
    a = ap.parse_args(argv)

    doc = icon_judge.load_spec()
    concepts = [dict(c) for c in ed.TEST_CONCEPTS]
    t0 = time.time()
    arms, spend = {}, {}
    for name, model in ARMS:
        # 예산은 **실행 전체**다. 팔마다 같은 상한을 새로 주면 최대 3배까지
        # 열린다(v0.1 개정: 첫 실행에서 내가 그렇게 열어뒀다).
        left = round(a.max_usd - sum(spend.values()), 6)
        if left <= 0:
            arms[name] = {"calls": [], "n_calls": 0, "rows": [], "n": 0,
                          "passed": 0, "pass_rate": None, "concepts": [],
                          "why": "실행 예산 소진 - 이 팔은 안 돌았다",
                          "model": model, "temperature_dropped": False}
            spend[name] = 0.0
            continue
        provider = ilr.make_provider(a.provider, model, left)
        arms[name] = run_arm(provider, doc, concepts, a.repeats)
        spend[name] = round(getattr(provider, "spent_here", 0.0), 6)
        arms[name]["model"] = model

    base = arms[BASELINE]
    res = {"spec": "tier-compare-v0",
           "design": "docs/tier-compare-v0-design.md",
           "provider": a.provider, "seconds": round(time.time() - t0, 1),
           "usd_by_arm": spend, "usd_total": round(sum(spend.values()), 6),
           "thresholds": {"tier_helps_lower": TIER_HELPS_LOWER,
                          "irrelevant_band": IRRELEVANT_BAND},
           "bootstrap": {"n": BOOTSTRAP_N, "seed": BOOTSTRAP_SEED,
                         "unit": "call"},
           "arms": {k: {kk: vv for kk, vv in v.items() if kk != "rows"}
                    for k, v in arms.items()},
           "extras": {k: extras(v) for k, v in arms.items()},
           "judgement": {k: verdict(v, base) for k, v in arms.items()
                         if k != BASELINE},
           "rows": {k: v["rows"] for k, v in arms.items()}}
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)

    print(f"제공자 {a.provider} · {res['seconds']}초 · "
          f"지출 ${res['usd_total']}")
    for name, _m in ARMS:
        arm, ex = res["arms"][name], res["extras"][name]
        rate = "-" if arm["pass_rate"] is None else f"{arm['pass_rate']:.4f}"
        line = (f"  {name:<7} {arm['model']:<20} 통과 {arm['passed']}/{arm['n']}"
                f" = {rate}  호출 {arm['n_calls']}  ${spend[name]}")
        if arm["temperature_dropped"]:
            line += "  [온도 미전송]"
        print(line)
        if ex["violations"]:
            print(f"          위반: {dict(list(ex['violations'].items())[:4])}")
        if arm["why"]:
            print(f"          중단: {arm['why']}")
    for name, j in res["judgement"].items():
        ci = j["ci95"]
        cis = "-" if ci[0] is None else f"[{ci[0]:+.3f}, {ci[1]:+.3f}]"
        dd = "-" if j["d"] is None else f"{j['d']:+.4f}"
        print(f"판정 {name} vs {BASELINE}: {j['verdict']} ({j['why']}) "
              f"d={dd} {cis}")
    print(f"기록: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
