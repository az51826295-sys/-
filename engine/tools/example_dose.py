"""예시 용량-반응 (docs/example-dose-v0-design.md).

  python -X utf8 tools/example_dose.py --provider mock
  GENESIS_SPEND=i-approve python -X utf8 tools/example_dose.py \\
      --provider anthropic --max-usd 0.25

세 팔은 프롬프트의 **예시 개수만** 다르다(0·1·3). 세트의 첫 아이콘·둘째·넷째에
대응한다. 부트스트랩은 **개념 단위**로 잡는다 — 통과가 개념 단위로 뭉치기
때문이고, 오늘 후보 단위로 잡아 구간이 좁게 나온 실수를 반복하지 않기 위해서다.
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

from tools import icon_judge                             # noqa: E402
from tools import icon_lane_run as ilr                   # noqa: E402

# --- 설계 §3의 동결값 ---------------------------------------------------
CARRY_LOWER = 0.20        # D의 95% 하한이 이 위면 examples_carry_compliance
IRRELEVANT_BAND = 0.05    # |D| 구간이 ±이 안이면 examples_irrelevant
MIN_CONCEPTS = 8
MIN_PER_ARM = 40
DOSES = (0, 1, 3)

BOOTSTRAP_N = 10000
BOOTSTRAP_SEED = 12345

N_PER_CALL = 6
TEMPERATURE = 1.0

# 설계 §2: 예시로 쓰는 자산과, 그 개념을 뺀 시험 개념 목록. 둘 다 동결.
EXAMPLE_GROUPS = ("01_attack", "02_defend", "03_shop")
EXAMPLE_ROOT = "out/icons/pick-v2/candidates"
TEST_CONCEPTS = (
    {"concept": "quest", "meaning": "퀘스트 목록"},
    {"concept": "equipment", "meaning": "장비 착용"},
    {"concept": "stats", "meaning": "능력치 보기"},
    {"concept": "dialogue", "meaning": "대화하기"},
    {"concept": "exit", "meaning": "나가기"},
    {"concept": "save", "meaning": "진행 상황 저장"},
    {"concept": "inventory", "meaning": "소지품 가방 열기"},
    {"concept": "map", "meaning": "지역 지도 보기"},
    {"concept": "settings", "meaning": "환경 설정"},
)


def load_examples(root: str = ROOT) -> list:
    """예시 자산 셋 — 순서 고정(설계 §2)."""
    out = []
    for group in EXAMPLE_GROUPS:
        d = os.path.join(root, EXAMPLE_ROOT, group)
        files = sorted(f for f in os.listdir(d) if f.endswith(".svg"))
        with open(os.path.join(d, files[0]), encoding="utf-8") as fh:
            out.append(fh.read())
    return out


def run_arm(items: list, provider, doc: dict, examples: list) -> dict:
    """한 팔 — 개념마다 1회 호출, 후보 전부 채점(중복도 안 버린다)."""
    rows, why = [], None
    for i, item in enumerate(items, 1):
        prompt = ilr.initial_prompt(item["concept"], item["meaning"],
                                    "dose", i, list(examples), doc, N_PER_CALL)
        ilr._assert_no_hidden_leak(prompt, doc)
        temp = min(TEMPERATURE, getattr(provider, "max_temperature", 2.0))
        try:
            raw = provider.generate(ilr.SYSTEM_PROMPT, prompt, temp, N_PER_CALL)
        except ilr.BudgetExhausted as exc:
            why = str(exc)
            break
        for svg in ilr.split_candidates(raw):
            res = icon_judge.judge_svg(svg, doc)
            rows.append({
                "concept": item["concept"], "verdict": res["verdict"],
                "violated": sorted(r["rule"] for r in res["rules"]
                                   if r["ok"] is False and not r.get("hidden")),
                "svg": svg})
    return {"n": len(rows), "passed": sum(1 for r in rows
                                          if r["verdict"] == "PASS"),
            "pass_rate": (sum(1 for r in rows if r["verdict"] == "PASS")
                          / len(rows) if rows else None),
            "concepts": sorted({r["concept"] for r in rows}),
            "why": why, "rows": rows}


def _by_concept(arm: dict) -> dict:
    out: dict = {}
    for r in arm["rows"]:
        c = out.setdefault(r["concept"], [0, 0])
        c[1] += 1
        if r["verdict"] == "PASS":
            c[0] += 1
    return {k: {"passed": v[0], "n": v[1], "rate": v[0] / v[1]}
            for k, v in out.items()}


def _cluster_bootstrap(a: dict, b: dict, n: int = BOOTSTRAP_N,
                       seed: int = BOOTSTRAP_SEED) -> tuple:
    """개념을 표본 단위로 재추출한 rate(a) − rate(b)의 95% 구간."""
    ca, cb = _by_concept(a), _by_concept(b)
    shared = sorted(set(ca) & set(cb))
    if not shared:
        return (None, None)
    rng = random.Random(seed)
    k = len(shared)
    diffs = []
    for _ in range(n):
        pa = pb = na = nb = 0
        for _ in range(k):
            c = shared[rng.randrange(k)]
            pa += ca[c]["passed"]
            na += ca[c]["n"]
            pb += cb[c]["passed"]
            nb += cb[c]["n"]
        diffs.append((pa / na if na else 0) - (pb / nb if nb else 0))
    diffs.sort()
    return (diffs[int(0.025 * (n - 1))], diffs[int(0.975 * (n - 1))])


def verdict(arms: dict) -> dict:
    """설계 §3. D = rate(ex3) − rate(ex0), 개념 군집 부트스트랩."""
    hi_arm, lo_arm = arms["ex3"], arms["ex0"]
    gate_ok = (all(a["n"] >= MIN_PER_ARM for a in arms.values())
               and all(len(a["concepts"]) >= MIN_CONCEPTS
                       for a in arms.values()))
    if hi_arm["pass_rate"] is None or lo_arm["pass_rate"] is None:
        return {"verdict": "undefined", "why": "empty_arm", "D": None,
                "ci95": [None, None], "gate_ok": False}
    D = hi_arm["pass_rate"] - lo_arm["pass_rate"]
    lo, hi = _cluster_bootstrap(hi_arm, lo_arm)
    if not gate_ok:
        v, why = "undefined", "sample_gate"
    elif lo is not None and lo > CARRY_LOWER:
        v, why = "examples_carry_compliance", "ci_lower_gt_threshold"
    elif (lo is not None and abs(lo) <= IRRELEVANT_BAND
          and abs(hi) <= IRRELEVANT_BAND):
        v, why = "examples_irrelevant", "ci_within_band"
    else:
        v, why = "undefined", "ci_straddles"
    return {"verdict": v, "why": why, "D": D, "ci95": [lo, hi],
            "gate_ok": gate_ok, "min_concepts": MIN_CONCEPTS,
            "min_per_arm": MIN_PER_ARM}


def rule_counts(arm: dict) -> dict:
    out: dict = {}
    for r in arm["rows"]:
        for rule in r["violated"]:
            out[rule] = out.get(rule, 0) + 1
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--provider", default="mock")
    ap.add_argument("--model", default=ilr.DEFAULT_MODEL)
    ap.add_argument("--max-usd", type=float, default=0.25)
    ap.add_argument("--out", default="data/example_dose_v0.json")
    a = ap.parse_args(argv)

    doc = icon_judge.load_spec()
    pool = load_examples()
    provider = ilr.make_provider(a.provider, a.model, a.max_usd)
    t0 = time.time()
    arms = {}
    for dose in DOSES:
        arms[f"ex{dose}"] = run_arm(list(TEST_CONCEPTS), provider, doc,
                                    pool[:dose])
    j = verdict(arms)
    res = {"spec": "example-dose-v0",
           "design": "docs/example-dose-v0-design.md",
           "provider": provider.name,
           "model": getattr(provider, "model", "mock"),
           "usd": round(getattr(provider, "spent_here", 0.0), 6),
           "seconds": round(time.time() - t0, 1),
           "retries": getattr(provider, "retries", 0),
           "thresholds": {"carry_lower": CARRY_LOWER,
                          "irrelevant_band": IRRELEVANT_BAND},
           "bootstrap": {"n": BOOTSTRAP_N, "seed": BOOTSTRAP_SEED,
                         "unit": "concept"},
           "judgement": j,
           "arms": {k: {kk: vv for kk, vv in v.items() if kk != "rows"}
                    for k, v in arms.items()},
           "by_concept": {k: _by_concept(v) for k, v in arms.items()},
           "rule_counts": {k: rule_counts(v) for k, v in arms.items()},
           "steps": {},
           # 지출로 얻은 후보는 버리지 않는다(23:33에 diversity_run에서 고친
           # 것과 같은 구멍이 여기 남아 있었다). SVG까지 남긴다.
           "rows": {k: v["rows"] for k, v in arms.items()}}
    # 판정 아님(설계 §4): 하나면 충분한가
    for lo_key, hi_key, name in (("ex0", "ex1", "d01"), ("ex1", "ex3", "d13")):
        if arms[hi_key]["pass_rate"] is not None \
                and arms[lo_key]["pass_rate"] is not None:
            ci = _cluster_bootstrap(arms[hi_key], arms[lo_key])
            res["steps"][name] = {
                "delta": arms[hi_key]["pass_rate"] - arms[lo_key]["pass_rate"],
                "ci95": list(ci)}
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)

    print(f"제공자 {res['provider']}/{res['model']}  지출 ${res['usd']}  "
          f"{res['seconds']}초  재시도 {res['retries']}")
    for k in ("ex0", "ex1", "ex3"):
        arm = res["arms"][k]
        rate = "-" if arm["pass_rate"] is None else f"{arm['pass_rate']:.4f}"
        print(f"  {k}: 통과 {arm['passed']}/{arm['n']} = {rate}"
              + (f"  ({arm['why']})" if arm["why"] else ""))
        rc = res["rule_counts"][k]
        if rc:
            print(f"    위반: {dict(list(rc.items())[:5])}")
    for name, st in res["steps"].items():
        lo, hi = st["ci95"]
        cis = "-" if lo is None else f"[{lo:+.3f}, {hi:+.3f}]"
        print(f"  {name} = {st['delta']:+.4f} {cis}")
    ci = j["ci95"]
    cis = "-" if ci[0] is None else f"[{ci[0]:+.4f}, {ci[1]:+.4f}]"
    dd = "-" if j["D"] is None else f"{j['D']:+.4f}"
    print(f"판정: {j['verdict']} ({j['why']})  D={dd} ci95={cis} "
          f"관문={j['gate_ok']}")
    print(f"기록: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
