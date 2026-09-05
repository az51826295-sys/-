"""후처리 스냅 실험 (docs/snap-fix-v0-design.md).

  python -X utf8 tools/snap_experiment.py --provider mock
  GENESIS_SPEND=i-approve python -X utf8 tools/snap_experiment.py \\
      --provider anthropic --max-usd 0.12

스펙은 주고 **예시는 안 준** 상태로 뽑는다 — 그래야 격자·끝모양 실패가 충분히
나오고, 그게 이 실험의 재료다. 판정 둘:
(a) 스냅 후 통과율 — **호출 단위** 부트스트랩
(b) 그림이 상하나 — Q2의 자(같은 개념 다른 원본들끼리의 거리)를 그대로 쓴다
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

from genesis import snap_fix                             # noqa: E402
from genesis import svg_raster                           # noqa: E402
from tools import example_dose as ed                     # noqa: E402
from tools import icon_judge                             # noqa: E402
from tools import icon_lane_run as ilr                   # noqa: E402

# 설계 §3 동결값 — (a)는 새 숫자, (b)는 Q2에서 상속
SNAP_WORKS_LOWER = 0.90
POINTLESS_MARGIN = 0.10
ENCODING_ONLY_UPPER = 0.25      # conformance-cost-q2-v0에서 그대로
CONTENT_LOSS_LOWER = 0.50       # 〃
MIN_CANDIDATES = 40
MIN_CALLS = 9
MIN_RATIO_ASSETS = 20

BOOTSTRAP_N = 10000
BOOTSTRAP_SEED = 12345
N_PER_CALL = 6
TEMPERATURE = 1.0


def generate(provider, doc: dict, concepts: list) -> list:
    """호출마다 후보를 뽑고 원본 판정까지 붙인다(예시 없음, 스펙 있음)."""
    calls = []
    for i, item in enumerate(concepts, 1):
        prompt = ilr.initial_prompt(item["concept"], item["meaning"],
                                    "snap", i, [], doc, N_PER_CALL)
        ilr._assert_no_hidden_leak(prompt, doc)
        temp = min(TEMPERATURE, getattr(provider, "max_temperature", 2.0))
        try:
            raw = provider.generate(ilr.SYSTEM_PROMPT, prompt, temp, N_PER_CALL)
        except ilr.BudgetExhausted:
            break
        cands = []
        for svg in ilr.split_candidates(raw):
            cands.append({"concept": item["concept"], "svg": svg,
                          "raw_verdict": icon_judge.judge_svg(svg, doc)["verdict"]})
        calls.append({"concept": item["concept"], "candidates": cands})
    return calls


def load_saved(dirs: list, doc: dict, root: str = ROOT) -> list:
    """이미 저장된 후보로 **지출 0** 판을 돈다(설계 §5의 제약 아래).

    저장된 것은 전부 통과분이라 통과율 판정(a)은 성립하지 않는다 — 그건
    undefined로 남기고, 손상 판정(b)만 낸다. 개념 폴더 하나를 한 '호출'처럼
    묶는다(같은 개념의 후보끼리 자를 만들기 위해서다).
    """
    calls = []
    for d in dirs:
        base = os.path.join(root, d)
        for group in sorted(os.listdir(base)):
            gdir = os.path.join(base, group)
            if not os.path.isdir(gdir):
                continue
            cands = []
            for f in sorted(os.listdir(gdir)):
                if not f.endswith(".svg"):
                    continue
                with open(os.path.join(gdir, f), encoding="utf-8") as fh:
                    svg = fh.read()
                cands.append({"concept": group, "svg": svg,
                              "raw_verdict":
                                  icon_judge.judge_svg(svg, doc)["verdict"]})
            if cands:
                calls.append({"concept": group, "candidates": cands})
    return calls


def apply_snap(calls: list, doc: dict) -> list:
    """스냅본을 만들고 다시 채점한다. 못 만든 것은 사유와 함께 남긴다."""
    for call in calls:
        for c in call["candidates"]:
            got = snap_fix.snap(c["svg"])
            c["snapped"] = got["svg"]
            c["snap_why"] = got["why"]
            c["changed"] = got["changed"]
            c["snapped_verdict"] = (
                icon_judge.judge_svg(got["svg"], doc)["verdict"]
                if got["svg"] else None)
    return calls


def _median(xs: list):
    if not xs:
        return None
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def _boot(values: list, n: int = BOOTSTRAP_N, seed: int = BOOTSTRAP_SEED,
          stat: str = "mean"):
    """구간을 낼 통계를 **명시**한다. 설계 §3(b)는 중앙값이라고 적혀 있는데
    평균 구간을 내면 표에 적힌 값과 구간이 다른 것을 말하게 된다."""
    if not values:
        return (None, None)
    rng = random.Random(seed)
    k = len(values)
    draws = []
    for _ in range(n):
        sample = [values[rng.randrange(k)] for _ in range(k)]
        draws.append(_median(sample) if stat == "median"
                     else sum(sample) / k)
    draws.sort()
    return (draws[int(0.025 * (n - 1))], draws[int(0.975 * (n - 1))])


def verdict_pass(calls: list, saved_corpus: bool = False) -> dict:
    """설계 §3(a) — 호출 단위.

    저장된 통과분만 있는 말뭉치에서는 이 판정을 **내지 않는다.** 원본이 전부
    통과인 표본에서 "스냅 후에도 100% 통과"는 스냅이 듣는다는 증거가 아니라
    표본이 이미 통과분이라는 사실의 되풀이다.
    """
    raw_rates, snap_rates = [], []
    n_cand = 0
    for call in calls:
        cands = call["candidates"]
        if not cands:
            continue
        n_cand += len(cands)
        raw_rates.append(sum(1 for c in cands
                             if c["raw_verdict"] == "PASS") / len(cands))
        snap_rates.append(sum(1 for c in cands
                              if c["snapped_verdict"] == "PASS") / len(cands))
    gate_ok = (n_cand >= MIN_CANDIDATES and len(calls) >= MIN_CALLS)
    raw = sum(raw_rates) / len(raw_rates) if raw_rates else None
    snapped = sum(snap_rates) / len(snap_rates) if snap_rates else None
    lo, hi = _boot(snap_rates)
    if saved_corpus or (raw is not None and raw >= 1.0):
        return {"verdict": "undefined", "why": "corpus_is_all_passing",
                "raw_pass": raw, "snapped_pass": snapped, "ci95": [lo, hi],
                "calls": len(snap_rates), "candidates": n_cand,
                "gate_ok": gate_ok,
                "note": "탈락분이 없는 표본에서는 통과율 판정을 내지 않는다"}
    if not gate_ok:
        v, why = "undefined", "sample_gate"
    elif lo is not None and lo >= SNAP_WORKS_LOWER:
        v, why = "snap_works", "ci_lower_ge_threshold"
    elif (lo is not None and lo < SNAP_WORKS_LOWER
          and hi < (raw or 0) + POINTLESS_MARGIN):
        v, why = "snap_pointless", "ci_upper_lt_raw_plus_margin"
    else:
        v, why = "undefined", "ci_straddles"
    return {"verdict": v, "why": why, "raw_pass": raw, "snapped_pass": snapped,
            "ci95": [lo, hi], "calls": len(snap_rates), "candidates": n_cand,
            "gate_ok": gate_ok}


def verdict_damage(calls: list) -> dict:
    """설계 §3(b) — Q2의 자를 그대로. 렌더가 없으면 fail이 아니라 undefined."""
    if not svg_raster.available():
        return {"verdict": "undefined", "why": "래스터 경로 없음(미측정)",
                "median_r": None, "ci95": [None, None], "assets": 0}
    scale = {}
    for call in calls:
        originals = [c["svg"] for c in call["candidates"]]
        pairs = []
        for i, a in enumerate(originals):
            for b in originals[i + 1:]:
                d = svg_raster.coverage_diff(a, b)
                if d is not None:
                    pairs.append(d)
        scale[call["concept"]] = _median(pairs)
    ratios, rows = [], []
    for call in calls:
        s = scale.get(call["concept"])
        for c in call["candidates"]:
            if not c.get("snapped"):
                continue
            d = svg_raster.coverage_diff(c["svg"], c["snapped"])
            if d is None:
                continue
            r = (d / s) if s else None
            rows.append({"concept": c["concept"], "d_conform": d, "r": r})
            if r is not None:
                ratios.append(r)
    lo, hi = _boot(ratios, stat="median")
    gate_ok = len(ratios) >= MIN_RATIO_ASSETS
    if not gate_ok:
        v, why = "undefined", "sample_gate"
    elif hi is not None and hi <= ENCODING_ONLY_UPPER:
        v, why = "encoding_only", "ci_upper_le_threshold"
    elif lo is not None and lo >= CONTENT_LOSS_LOWER:
        v, why = "content_loss", "ci_lower_ge_threshold"
    else:
        v, why = "undefined", "ci_straddles"
    return {"verdict": v, "why": why, "median_r": _median(ratios),
            "ci95": [lo, hi], "assets": len(ratios), "scale": scale,
            "rows": rows, "gate_ok": gate_ok}


def rule_counts(calls: list, key: str) -> dict:
    doc = icon_judge.load_spec()
    out: dict = {}
    for call in calls:
        for c in call["candidates"]:
            svg = c["svg"] if key == "raw" else c.get("snapped")
            if not svg:
                continue
            res = icon_judge.judge_svg(svg, doc)
            for r in res["rules"]:
                if r["ok"] is False and not r.get("hidden"):
                    out[r["rule"]] = out.get(r["rule"], 0) + 1
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--provider", default="mock")
    ap.add_argument("--model", default=ilr.DEFAULT_MODEL)
    ap.add_argument("--max-usd", type=float, default=0.12)
    ap.add_argument("--from-dir", action="append", default=[],
                    help="저장된 후보 디렉터리(지출 0 판, 손상 판정만)")
    ap.add_argument("--out", default="data/snap_experiment_v0.json")
    a = ap.parse_args(argv)

    doc = icon_judge.load_spec()
    t0 = time.time()
    if a.from_dir:
        provider = type("NoProvider", (), {"name": "saved", "model": "-",
                                           "spent_here": 0.0})()
        calls = apply_snap(load_saved(a.from_dir, doc), doc)
    else:
        provider = ilr.make_provider(a.provider, a.model, a.max_usd)
        calls = apply_snap(generate(provider, doc, list(ed.TEST_CONCEPTS)), doc)
    vp = verdict_pass(calls, saved_corpus=bool(a.from_dir))
    vd = verdict_damage(calls)
    res = {"spec": "snap-fix-v0", "design": "docs/snap-fix-v0-design.md",
           "provider": provider.name,
           "model": getattr(provider, "model", "mock"),
           "usd": round(getattr(provider, "spent_here", 0.0), 6),
           "seconds": round(time.time() - t0, 1),
           "thresholds": {"snap_works_lower": SNAP_WORKS_LOWER,
                          "pointless_margin": POINTLESS_MARGIN,
                          "encoding_only_upper": ENCODING_ONLY_UPPER,
                          "content_loss_lower": CONTENT_LOSS_LOWER},
           "source": ("saved:" + ",".join(a.from_dir)) if a.from_dir
                     else "generated",
           "pass_verdict": vp,
           "damage_verdict": {k: v for k, v in vd.items() if k != "rows"},
           "rule_counts": {"raw": rule_counts(calls, "raw"),
                           "snapped": rule_counts(calls, "snapped")},
           "calls": calls}
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)

    print(f"제공자 {res['provider']}/{res['model']}  지출 ${res['usd']}  "
          f"{res['seconds']}초")
    lo, hi = vp["ci95"]
    ci = "-" if lo is None else f"[{lo:.3f}, {hi:.3f}]"
    print(f"통과율: 원본 {vp['raw_pass']:.3f} → 스냅 {vp['snapped_pass']:.3f} "
          f"{ci}  → {vp['verdict']} ({vp['why']})")
    print(f"  호출 {vp['calls']}, 후보 {vp['candidates']}, 관문 {vp['gate_ok']}")
    lo, hi = vd["ci95"]
    ci = "-" if lo is None else f"[{lo:.3f}, {hi:.3f}]"
    med = "-" if vd["median_r"] is None else f"{vd['median_r']:.3f}"
    print(f"그림 손상: median r={med} {ci} 자산 {vd['assets']} "
          f"→ {vd['verdict']} ({vd['why']})")
    print(f"위반(원본): {dict(list(res['rule_counts']['raw'].items())[:5])}")
    print(f"위반(스냅): {dict(list(res['rule_counts']['snapped'].items())[:5])}")
    print(f"기록: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
