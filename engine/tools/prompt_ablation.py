"""프롬프트 제거 통제 (docs/prompt-ablation-v0-design.md).

  # 목 파일럿 (지출 0) — 실호출 전에 반드시 통과해야 한다
  python -X utf8 tools/prompt_ablation.py --provider mock

  # 실행
  GENESIS_SPEND=i-approve python -X utf8 tools/prompt_ablation.py \\
      --provider anthropic --max-usd 0.10

두 팔은 **프롬프트만** 다르다(§2-1): 스펙 블록·시스템 프롬프트의 스펙 문장·세트
예시를 뺀 팔과, 스펙을 주되 예시는 똑같이 뺀 팔.

`run_concept`을 쓰지 않고 여기서 직접 한 라운드만 돈다. 이유 둘:
- **중복을 버리지 않는다.** 생산 루프는 중복 서명을 조용히 버리는데, 그러면
  통과율의 분모가 팔마다 달라진다.
- **재시도를 하지 않는다.** 재시도가 섞이면 통과율이 프롬프트가 아니라 루프를
  재는 값이 된다.
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

from genesis import taste_features                       # noqa: E402
from tools import icon_judge                             # noqa: E402
from tools import icon_lane_run as ilr                   # noqa: E402

# --- 설계 §3의 동결값 ---------------------------------------------------
SPEC_HELPS_LOWER = 0.20      # d의 95% 하한이 이 위면 spec_helps
IRRELEVANT_UPPER = 0.05      # d의 95% 상한이 이 아래면 prompt_irrelevant
MIN_PER_ARM = 24            # v0(후보 단위) — 기록 호환용으로 남긴다
MIN_CALLS_PER_ARM = 18      # v1 §6: 표본 단위는 호출이다
MIN_CONCEPTS = 4
MIN_CONCEPTS_V1 = 8
REPEATS = 2                 # 개념당 호출 수

BOOTSTRAP_N = 10000
BOOTSTRAP_SEED = 12345

N_PER_CALL = 6
TEMPERATURE = 1.0            # 라운드 1의 생산 설정
SET_FILE = "data/icon_sets/rpg-ui-v1.json"


def load_concepts(n: int = MIN_CONCEPTS, root: str = ROOT,
                  set_file: str = SET_FILE) -> list:
    with open(os.path.join(root, set_file), encoding="utf-8") as fh:
        items = json.load(fh)
    items = items["items"] if isinstance(items, dict) else items
    return items[:n]


def run_arm(items: list, provider, doc: dict, no_spec: bool,
            repeats: int = 1) -> dict:
    """한 팔 — 개념마다 `repeats`회 호출, 후보 전부를 채점(중복도 안 버린다).

    v1(설계 §6): 표본 단위는 **호출**이다. 호출별 통과 비율을 따로 남긴다 —
    한 호출의 후보 6개는 통과·탈락이 같이 가므로 후보를 표본으로 세면 정밀도가
    약 6배 부풀려진다.
    """
    rows, why, calls = [], None, []
    system = ilr.SYSTEM_PROMPT_NO_SPEC if no_spec else ilr.SYSTEM_PROMPT
    plan = [(i, item) for i, item in enumerate(items, 1)
            for _ in range(repeats)]
    for i, item in plan:
        concept = item["concept"]
        meaning = item.get("meaning", concept)
        prompt = ilr.initial_prompt(concept, meaning, "ablation", i, [], doc,
                                    N_PER_CALL, no_spec=no_spec)
        ilr._assert_no_hidden_leak(prompt, doc)
        temp = min(TEMPERATURE, getattr(provider, "max_temperature", 2.0))
        try:
            raw = provider.generate(system, prompt, temp, N_PER_CALL)
        except ilr.BudgetExhausted as exc:
            why = str(exc)                 # 예산 소진은 결격이 아니라 미정의
            break
        call_rows = []
        for svg in ilr.split_candidates(raw):
            res = icon_judge.judge_svg(svg, doc)
            call_rows.append({
                "concept": concept, "verdict": res["verdict"],
                "violated": sorted(r["rule"] for r in res["rules"]
                                   if r["ok"] is False and not r.get("hidden")),
                "hidden_violated": any(r["ok"] is False and r.get("hidden")
                                       for r in res["rules"]),
                "signature": taste_features.measure(svg).get("path_count"),
                "svg": svg})
        rows += call_rows
        n_pass = sum(1 for r in call_rows if r["verdict"] == "PASS")
        calls.append({"concept": concept, "n": len(call_rows),
                      "passed": n_pass,
                      "rate": n_pass / len(call_rows) if call_rows else None})
    passed = sum(1 for r in rows if r["verdict"] == "PASS")
    return {"arm": "no_spec" if no_spec else "with_spec",
            "calls": calls, "n_calls": len(calls),
            "n": len(rows), "passed": passed,
            "pass_rate": passed / len(rows) if rows else None,
            "concepts": sorted({r["concept"] for r in rows}),
            "fingerprint": ilr.prompt_fingerprint(doc, no_spec=no_spec),
            "why": why, "rows": rows}


def _rate(outcomes: list, rng) -> float:
    k = len(outcomes)
    return sum(outcomes[rng.randrange(k)] for _ in range(k)) / k


def verdict(arm_with: dict, arm_no: dict, unit: str = "call") -> dict:
    """설계 §3(문턱) + §6(표본 단위). 기본은 v1의 **호출 단위**다."""
    if unit == "call":
        o_with = [c["rate"] for c in arm_with.get("calls", [])
                  if c["rate"] is not None]
        o_no = [c["rate"] for c in arm_no.get("calls", [])
                if c["rate"] is not None]
        gate_ok = (len(o_with) >= MIN_CALLS_PER_ARM
                   and len(o_no) >= MIN_CALLS_PER_ARM
                   and len(arm_with["concepts"]) >= MIN_CONCEPTS_V1
                   and len(arm_no["concepts"]) >= MIN_CONCEPTS_V1)
    else:
        o_with = [1 if r["verdict"] == "PASS" else 0 for r in arm_with["rows"]]
        o_no = [1 if r["verdict"] == "PASS" else 0 for r in arm_no["rows"]]
        gate_ok = (len(o_with) >= MIN_PER_ARM and len(o_no) >= MIN_PER_ARM
                   and len(arm_with["concepts"]) >= MIN_CONCEPTS
                   and len(arm_no["concepts"]) >= MIN_CONCEPTS)
    if not o_with or not o_no:
        return {"verdict": "undefined", "why": "empty_arm", "d": None,
                "ci95": [None, None], "gate_ok": False}
    d = (sum(o_with) / len(o_with)) - (sum(o_no) / len(o_no))
    rng = random.Random(BOOTSTRAP_SEED)
    diffs = sorted(_rate(o_with, rng) - _rate(o_no, rng)
                   for _ in range(BOOTSTRAP_N))
    lo = diffs[int(0.025 * (BOOTSTRAP_N - 1))]
    hi = diffs[int(0.975 * (BOOTSTRAP_N - 1))]
    if not gate_ok:
        v, why = "undefined", "sample_gate"
    elif lo > SPEC_HELPS_LOWER:
        v, why = "spec_helps", "ci_lower_gt_threshold"
    elif hi < IRRELEVANT_UPPER:
        v, why = "prompt_irrelevant", "ci_upper_lt_threshold"
    else:
        v, why = "undefined", "ci_straddles"
    return {"verdict": v, "why": why, "d": d, "ci95": [lo, hi],
            "gate_ok": gate_ok, "unit": unit,
            "n_with": len(o_with), "n_no": len(o_no),
            "min_per_arm": (MIN_CALLS_PER_ARM if unit == "call"
                            else MIN_PER_ARM),
            "min_concepts": (MIN_CONCEPTS_V1 if unit == "call"
                             else MIN_CONCEPTS)}


def rule_counts(arm: dict) -> dict:
    out: dict = {}
    for r in arm["rows"]:
        for rule in r["violated"]:
            out[rule] = out.get(rule, 0) + 1
        if r["hidden_violated"]:
            out["internal_quality_gate"] = out.get("internal_quality_gate", 0) + 1
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--provider", default="mock")
    ap.add_argument("--model", default=ilr.DEFAULT_MODEL)
    ap.add_argument("--max-usd", type=float, default=0.10)
    ap.add_argument("--concepts", type=int, default=MIN_CONCEPTS)
    ap.add_argument("--repeats", type=int, default=1,
                    help="개념당 호출 수(v1은 2)")
    ap.add_argument("--set-file", default=SET_FILE)
    ap.add_argument("--dose-concepts", action="store_true",
                    help="용량-반응 실험과 **같은 9개념**을 쓴다(v1 §6 등록값)")
    ap.add_argument("--out", default="data/prompt_ablation_v0.json")
    a = ap.parse_args(argv)

    doc = icon_judge.load_spec()
    if a.dose_concepts:
        from tools import example_dose as ed
        items = [dict(c) for c in ed.TEST_CONCEPTS]
    else:
        items = load_concepts(a.concepts, set_file=a.set_file)
    provider = ilr.make_provider(a.provider, a.model, a.max_usd)
    t0 = time.time()
    arm_with = run_arm(items, provider, doc, no_spec=False,
                       repeats=a.repeats)
    arm_no = run_arm(items, provider, doc, no_spec=True, repeats=a.repeats)
    res = {"spec": "prompt-ablation-v0",
           "design": "docs/prompt-ablation-v0-design.md",
           "provider": provider.name,
           "model": getattr(provider, "model", "mock"),
           "usd": round(getattr(provider, "spent_here", 0.0), 6),
           "seconds": round(time.time() - t0, 1),
           "thresholds": {"spec_helps_lower": SPEC_HELPS_LOWER,
                          "irrelevant_upper": IRRELEVANT_UPPER},
           "bootstrap": {"n": BOOTSTRAP_N, "seed": BOOTSTRAP_SEED},
           "with_spec": {k: v for k, v in arm_with.items() if k != "rows"},
           "no_spec": {k: v for k, v in arm_no.items() if k != "rows"},
           "rule_counts": {"with_spec": rule_counts(arm_with),
                           "no_spec": rule_counts(arm_no)},
           "judgement": verdict(arm_with, arm_no, unit="call"),
           "judgement_v0_candidate_unit": verdict(arm_with, arm_no,
                                                  unit="candidate"),
           # 지출로 얻은 후보는 버리지 않는다 — 후처리 스냅 실험처럼 **탈락분**이
           # 재료가 되는 실험이 있다. 개수만 남기면 그때 돈을 또 써야 한다.
           "rows": {"with_spec": arm_with["rows"],
                    "no_spec": arm_no["rows"]}}
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)

    j = res["judgement"]
    print(f"제공자 {res['provider']}/{res['model']}  "
          f"지출 ${res['usd']}  {res['seconds']}초")
    for key in ("with_spec", "no_spec"):
        arm = res[key]
        rate = "-" if arm["pass_rate"] is None else f"{arm['pass_rate']:.4f}"
        print(f"  {key}: 통과 {arm['passed']}/{arm['n']} = {rate}"
              + (f"  ({arm['why']})" if arm["why"] else ""))
        rc = res["rule_counts"][key]
        if rc:
            print(f"    위반 분포: {rc}")
    ci = j["ci95"]
    cis = "-" if ci[0] is None else f"[{ci[0]:+.4f}, {ci[1]:+.4f}]"
    dd = "-" if j["d"] is None else f"{j['d']:+.4f}"
    print(f"판정: {j['verdict']} ({j['why']})  d={dd} ci95={cis} "
          f"관문={j['gate_ok']}")
    print(f"기록: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
