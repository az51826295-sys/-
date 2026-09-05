"""다양성 60후보 세션 (docs/diversity-run-v1-design.md).

  # 목 파일럿 (지출 0)
  python -X utf8 tools/diversity_run.py --provider mock --calls 3

  # 실행
  GENESIS_SPEND=i-approve python -X utf8 tools/diversity_run.py \\
      --provider anthropic --max-usd 0.20

생산 설정 그대로 **6개씩 10번 독립 호출**한다. 60개를 한 번에 요구하지 않는다 —
한 응답 안에서 모델은 스스로 안 겹치려 하므로 그 다양성은 우리가 실제로 쓰는
방식의 다양성이 아니다(§2).

**중복을 버리지 않는다.** 생산 루프는 중복 서명을 조용히 버리지만, 여기서는
그게 재려는 신호 자체다.
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

from tools import diversity_curve as dcv                 # noqa: E402
from tools import icon_judge                             # noqa: E402
from tools import icon_lane_run as ilr                   # noqa: E402

# 판정식·문턱은 v0에서 상속한다. 여기서 새 숫자를 만들지 않는다.
FLAT_LOWER = dcv.FLAT_LOWER              # 0.80
SATURATING_UPPER = dcv.SATURATING_UPPER  # 0.50
TIERS = dcv.TIERS

MIN_CALLS = 10                # 개념당 호출 (설계 §2-1 관문)
MIN_CANDIDATES = 40           # u_within 관문
BOOTSTRAP_N = dcv.BOOTSTRAP_N
BOOTSTRAP_SEED = dcv.BOOTSTRAP_SEED

N_PER_CALL = 6
TEMPERATURE = 1.0
SET_FILE = "data/icon_sets/rpg-ui-v1.json"


def load_concepts(n: int, root: str = ROOT, set_file: str = SET_FILE,
                  skip: int = 0) -> list:
    """세트 파일에서 개념을 뽑는다. `skip`으로 앞을 건너뛴다.

    예시로 쓰는 개념(attack·defend·shop)을 시험 개념에 넣지 않으려면 부르는 쪽이
    건너뛴다 — 예시가 곧 정답이면 순환이다.
    """
    with open(os.path.join(root, set_file), encoding="utf-8") as fh:
        items = json.load(fh)
    items = items["items"] if isinstance(items, dict) else items
    return items[skip:skip + n]


def load_examples(root: str = ROOT, k: int = 3) -> list:
    """생산 루프가 넣는 것과 같은 재료 — 이미 통과해 저장된 아이콘 SVG."""
    base = os.path.join(root, "out", "icons", "pick-v2", "candidates")
    out = []
    for group in sorted(os.listdir(base))[:k]:
        files = sorted(os.listdir(os.path.join(base, group)))
        if files:
            with open(os.path.join(base, group, files[0]), encoding="utf-8") as fh:
                out.append(fh.read())
    return out


def run_concept_calls(item: dict, provider, doc: dict, calls: int,
                     examples: list | None = None, sink=None) -> dict:
    """개념 하나를 `calls`번 독립 호출. 프롬프트는 매번 같다.

    `examples`는 생산 루프가 넣는 세트 예시(이미 통과한 아이콘)다. 설계 §2가
    말한 "생산 설정 그대로"는 이것을 **넣는다**는 뜻이다 — 1회차에서 내가 빈
    목록으로 돌려 통과율이 무너졌고 표본이 6분의 1이 됐다.
    """
    concept = item["concept"]
    meaning = item.get("meaning", concept)
    prompt = ilr.initial_prompt(concept, meaning, "diversity", 1,
                                list(examples or []), doc, N_PER_CALL)
    ilr._assert_no_hidden_leak(prompt, doc)
    temp = min(TEMPERATURE, getattr(provider, "max_temperature", 2.0))
    out, why = [], None
    for k in range(1, calls + 1):
        if sink is not None:
            sink(concept, list(out))          # 크래시에 대비한 중간 저장
        try:
            raw = provider.generate(ilr.SYSTEM_PROMPT, prompt, temp, N_PER_CALL)
        except ilr.BudgetExhausted as exc:
            why = str(exc)                  # 예산 소진 = 미정의, 결격 아님
            break
        cands = []
        for svg in ilr.split_candidates(raw):
            res = icon_judge.judge_svg(svg, doc)
            cands.append({"verdict": res["verdict"], "svg": svg,
                          "signatures": dcv.signatures(svg)})
        out.append({"call": k, "n": len(cands),
                    "passed": sum(1 for c in cands if c["verdict"] == "PASS"),
                    "candidates": cands})
    return {"concept": concept, "calls": out, "why": why}


def _bootstrap_ci(values: list, n: int = BOOTSTRAP_N,
                  seed: int = BOOTSTRAP_SEED) -> tuple:
    if not values:
        return (None, None)
    rng = random.Random(seed)
    k = len(values)
    means = sorted(sum(values[rng.randrange(k)] for _ in range(k)) / k
                   for _ in range(n))
    return (means[int(0.025 * (n - 1))], means[int(0.975 * (n - 1))])


def _verdict(values: list, gate_ok: bool) -> dict:
    """v0 §5의 3값을 그대로 쓴다."""
    if not values:
        return {"verdict": "undefined", "why": "no_values",
                "mean": None, "ci95": [None, None]}
    mean = sum(values) / len(values)
    lo, hi = _bootstrap_ci(values)
    if not gate_ok:
        v, why = "undefined", "sample_gate"
    elif lo >= FLAT_LOWER:
        v, why = "flat", "ci_lower_ge_flat"
    elif hi <= SATURATING_UPPER:
        v, why = "saturating", "ci_upper_le_saturating"
    else:
        v, why = "undefined", "ci_straddles"
    return {"verdict": v, "why": why, "mean": mean, "ci95": [lo, hi],
            "n_calls": len(values)}


def analyse(runs: list) -> dict:
    """설계 §2-1의 두 추정량 + §3의 층위 사다리."""
    tiers: dict = {}
    for tier in TIERS:
        within, across, curve = [], [], {}
        dup_total, cand_total, calls_total = 0, 0, 0
        per_concept = []
        for run in runs:
            seen: set = set()
            w_vals, a_vals, c_curve = [], [], []
            n_pass_concept = 0
            for call in run["calls"]:
                calls_total += 1
                sigs = [c["signatures"][tier] for c in call["candidates"]
                        if c["verdict"] == "PASS"]
                n_pass_concept += len(sigs)
                cand_total += len(sigs)
                if sigs:
                    u = dcv.good_turing_u(sigs)
                    if u is not None:
                        w_vals.append(u)
                if call["call"] > 1 and sigs:
                    fresh = sum(1 for s in sigs if s not in seen) / len(sigs)
                    a_vals.append(fresh)
                    c_curve.append({"call": call["call"], "novel": fresh,
                                    "seen_before": len(seen)})
                seen |= set(sigs)
            # 분해능은 **개념 전체**에서 본다. 호출 안만 세면 "같은 걸 다시
            # 준다"(호출 사이 중복)가 자에 안 잡힌다 — 그게 이 실험의 신호다.
            dup_total += n_pass_concept - len(seen)
            within += w_vals
            across += a_vals
            curve[run["concept"]] = c_curve
            per_concept.append({"concept": run["concept"],
                                "calls": len(run["calls"]),
                                "passed": n_pass_concept,
                                "distinct_total": len(seen)})
        gate_within = all(p["calls"] >= MIN_CALLS
                          and p["passed"] >= MIN_CANDIDATES
                          for p in per_concept) and bool(per_concept)
        gate_across = all(p["calls"] >= MIN_CALLS
                          for p in per_concept) and bool(per_concept)
        tiers[tier] = {
            "duplicates": dup_total, "has_resolution": dup_total > 0,
            "candidates": cand_total, "calls": calls_total,
            "per_concept": per_concept,
            "u_within": _verdict(within, gate_within),
            "u_across": _verdict(across, gate_across),
            "novelty_curve": curve}
    chosen = next((t for t in TIERS if tiers[t]["has_resolution"]), None)
    return {"spec": "diversity-run-v1",
            "design": "docs/diversity-run-v1-design.md",
            "tier_used": chosen,
            "thresholds": {"flat_lower": FLAT_LOWER,
                           "saturating_upper": SATURATING_UPPER},
            "gate": {"min_calls": MIN_CALLS,
                     "min_candidates": MIN_CANDIDATES},
            "tiers": tiers}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--provider", default="mock")
    ap.add_argument("--model", default=ilr.DEFAULT_MODEL)
    ap.add_argument("--max-usd", type=float, default=0.20)
    ap.add_argument("--concepts", type=int, default=2)
    ap.add_argument("--set-file", default=SET_FILE)
    ap.add_argument("--skip", type=int, default=0,
                    help="세트 앞쪽 개념을 건너뛴다(예시로 쓴 개념 회피)")
    ap.add_argument("--calls", type=int, default=10)
    ap.add_argument("--examples", action="store_true",
                    help="생산 설정처럼 세트 예시를 프롬프트에 넣는다(설계 §2)")
    ap.add_argument("--out", default="data/diversity_run_v1.json")
    a = ap.parse_args(argv)

    doc = icon_judge.load_spec()
    provider = ilr.make_provider(a.provider, a.model, a.max_usd)
    t0 = time.time()
    examples = load_examples() if a.examples else []
    ckpt = os.path.join(ROOT, a.out.replace(".json", ".checkpoint.json"))
    partial: dict = {}

    def sink(concept, calls_so_far):
        """호출 하나 끝날 때마다 원자료를 떨군다.

        21:56에 재실행이 첫 호출에서 끊겼을 때 20호출짜리 실행이 통째로 날아갔다
        (그때는 지출 0이었지만, 15번째에서 끊겼다면 지출한 자료를 잃었을 것이다).
        """
        partial[concept] = calls_so_far
        with open(ckpt, "w", encoding="utf-8") as fh:
            json.dump({"partial": partial}, fh, ensure_ascii=False)

    runs = [run_concept_calls(item, provider, doc, a.calls, examples, sink)
            for item in load_concepts(a.concepts, set_file=a.set_file,
                                      skip=a.skip)]
    res = analyse(runs)
    res.update({"provider": provider.name,
                "model": getattr(provider, "model", "mock"),
                "usd": round(getattr(provider, "spent_here", 0.0), 6),
                "seconds": round(time.time() - t0, 1),
                "fingerprint": ilr.prompt_fingerprint(doc),
                "examples_in_prompt": bool(a.examples),
                "retries": getattr(provider, "retries", 0),
                "retry_log": getattr(provider, "retry_log", []),
                "runs": [{"concept": r["concept"], "why": r["why"],
                          "calls": [{"call": c["call"], "n": c["n"],
                                     "passed": c["passed"],
                                     # 지출로 얻은 자료는 버리지 않는다. 1회차
                                     # 기록은 요약만 남겨서, 나중에 다른 각도로
                                     # 보려면 돈을 또 써야 하는 상태였다.
                                     "candidates": c["candidates"]}
                                    for c in r["calls"]]} for r in runs]})
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)

    print(f"제공자 {res['provider']}/{res['model']}  지출 ${res['usd']}  "
          f"{res['seconds']}초  판정 층위 {res['tier_used']}")
    for tier in TIERS:
        t = res["tiers"][tier]
        w, ac = t["u_within"], t["u_across"]
        def fmt(x):
            if x["mean"] is None:
                return "-"
            lo, hi = x["ci95"]
            return f"{x['mean']:.3f} [{lo:.3f}, {hi:.3f}] {x['verdict']}"
        print(f"  {tier}: 후보 {t['candidates']} 중복 {t['duplicates']} "
              f"분해능={'있음' if t['has_resolution'] else '없음'}")
        print(f"     호출 안 u_within = {fmt(w)}")
        print(f"     호출 사이 u_across = {fmt(ac)}")
    print(f"기록: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
