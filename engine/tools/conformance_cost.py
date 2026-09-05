"""순응 비용 + 제약별 구속도 v0 (docs/conformance-cost-q2-v0-design.md).

사전 등록된 규칙만 구현한다. 새 특징·새 문턱을 여기서 만들지 않는다.

  python -X utf8 tools/conformance_cost.py --out data/conformance_q2_v0.json

지출 0. 08-07 오디션 산출물과 반입 기록(data/pixellab_intake.json)만 읽는다.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import asset_probe                     # noqa: E402
from genesis import image_taste_features as itf     # noqa: E402
from tools import asset_intake as ai                # noqa: E402
from tools import judge_bench as jb                 # noqa: E402

# --- 설계 §3: 스펙이 규제하는 축은 거리에서 뺀다 (순환 방지) ------------
REGULATED = ("color_count", "opaque_ratio")
AXES = tuple(f for f in itf.FEATURES if f not in REGULATED)

# --- 설계 §5의 동결값 ---------------------------------------------------
ENCODING_ONLY_UPPER = 0.25   # 95% 상한이 이 이하면 encoding_only
CONTENT_LOSS_LOWER = 0.50    # 95% 하한이 이 이상이면 content_loss
MIN_ASSETS = 20
MIN_GROUPS = 2

BOOTSTRAP_N = 10000
BOOTSTRAP_SEED = 12345

INTAKE = "data/pixellab_intake.json"
SPEC = "data/image_specs/pixel-sprite-v2.yaml"
MAX_COLORS = 24              # 스펙에서 온다. 여기서 정한 숫자가 아니다


def _median(xs: list):
    if not xs:
        return None
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def _bootstrap_ci(values: list, n: int = BOOTSTRAP_N,
                  seed: int = BOOTSTRAP_SEED) -> tuple:
    """자산을 표본 단위로 재추출한 중앙값의 95% 구간."""
    if not values:
        return (None, None)
    rng = random.Random(seed)
    k = len(values)
    meds = []
    for _ in range(n):
        meds.append(_median([values[rng.randrange(k)] for _ in range(k)]))
    meds.sort()
    return (meds[int(0.025 * (n - 1))], meds[int(0.975 * (n - 1))])


def load_rows(root: str = ROOT) -> list:
    """반입 기록 → (그룹, 원본 경로, 후처리본 경로, 판정, 위반, 측정값)."""
    with open(os.path.join(root, INTAKE), encoding="utf-8") as fh:
        intake = json.load(fh)
    rows = []
    for g in intake["groups"]:
        for r in g["rows"]:
            rows.append({"group": g["group"], "profile": r.get("profile"),
                         "source": r["source"], "fixed_path": r["path"],
                         "raw_verdict": r.get("raw_verdict"),
                         "verdict": r.get("verdict"),
                         "violations": r.get("violations") or [],
                         "measured": r.get("measured") or {}})
    return rows


def _vec(path: str, root: str = ROOT):
    m = itf.measure(os.path.join(root, path.replace("\\", os.sep)))
    if m.get("error"):
        return None, m["error"]
    if any(m.get(a) is None for a in AXES):
        return None, "특징 미측정"
    return [float(m[a]) for a in AXES], None


def _scaled_distance(a: list, b: list, sds: list) -> float:
    tot = 0.0
    for i, sd in enumerate(sds):
        if sd and sd > 0:
            tot += ((a[i] - b[i]) / sd) ** 2
    return math.sqrt(tot)


def conformance(rows: list, root: str = ROOT, vec_fn=None) -> dict:
    """설계 §3~§5: 순응 거리 → 그룹 내 자로 나눔 → 3값 판정.

    `vec_fn`은 시험용 주입점이다(경로 → (벡터, 오류)). 기본은 실제 측정기.
    """
    vec = vec_fn or _vec
    vecs, skipped = [], []
    for r in rows:
        v_src, e1 = vec(r["source"], root)
        v_fix, e2 = vec(r["fixed_path"], root)
        if v_src is None or v_fix is None:
            skipped.append({"source": r["source"],
                            "reason": e1 or e2 or "미측정"})
            continue
        vecs.append({**r, "v_src": v_src, "v_fix": v_fix})

    if not vecs:
        return {"verdict": "undefined", "why": "no_measurable_assets",
                "assets": [], "skipped": skipped}

    # 특징별 표준편차 = 전체 표본(원본+후처리본) 기준 (설계 §3)
    pool = [v["v_src"] for v in vecs] + [v["v_fix"] for v in vecs]
    sds = []
    for i in range(len(AXES)):
        col = [p[i] for p in pool]
        mu = sum(col) / len(col)
        sds.append(math.sqrt(sum((c - mu) ** 2 for c in col) / len(col)))

    # 그룹별 자: 원본들끼리의 쌍거리 중앙값
    scale, groups = {}, {}
    for v in vecs:
        groups.setdefault(v["group"], []).append(v)
    for g, items in groups.items():
        pairs = [_scaled_distance(a["v_src"], b["v_src"], sds)
                 for i, a in enumerate(items) for b in items[i + 1:]]
        scale[g] = {"n_originals": len(items), "d_between": _median(pairs)}

    assets, ratios = [], []
    for v in vecs:
        d = _scaled_distance(v["v_src"], v["v_fix"], sds)
        s = scale[v["group"]]["d_between"]
        if not s:
            assets.append({"source": v["source"], "group": v["group"],
                           "d_conform": d, "r": None,
                           "why": "no_scale_in_group"})
            continue
        r = d / s
        ratios.append(r)
        assets.append({"source": v["source"], "group": v["group"],
                       "d_conform": d, "r": r, "why": None})

    used_groups = {a["group"] for a in assets if a["r"] is not None}
    gate_ok = (len(ratios) >= MIN_ASSETS and len(used_groups) >= MIN_GROUPS)
    med = _median(ratios)
    lo, hi = _bootstrap_ci(ratios)

    if not gate_ok:
        verdict, why = "undefined", "sample_gate"
    elif hi is not None and hi <= ENCODING_ONLY_UPPER:
        verdict, why = "encoding_only", "ci_upper_le_encoding_only"
    elif lo is not None and lo >= CONTENT_LOSS_LOWER:
        verdict, why = "content_loss", "ci_lower_ge_content_loss"
    else:
        verdict, why = "undefined", "ci_straddles"

    return {"verdict": verdict, "why": why, "median_r": med,
            "ci95": [lo, hi], "axes": list(AXES), "excluded_axes": list(REGULATED),
            "feature_sd": dict(zip(AXES, sds)), "group_scale": scale,
            "sample": {"assets_used": len(ratios), "groups_used": len(used_groups),
                       "gate_ok": gate_ok, "min_assets": MIN_ASSETS,
                       "min_groups": MIN_GROUPS},
            "assets": assets, "skipped": skipped}


def rule_rows(path: str, profile: str, doc: dict, reg: list):
    """자산 하나에 대한 제약별 행(ok True/False/None) + 측정값.

    `judge_asset`과 같은 경로를 쓰되 위반뿐 아니라 **모든 제약의 행**을 받는다
    — 아무도 안 걸린 제약(사문)을 세려면 통과한 행도 필요하다.
    """
    atom = next(a for a in reg if a["id"] == ai.ATOM_ID)
    measured = asset_probe.measure_pixel_art(path)
    sample = {"spec": ai.spec_for(profile, doc), "measured": measured,
              "claim": {}}
    return jb.explain_conformance(atom["judge"]["params"], sample), measured


def binding(rows: list, doc: dict | None = None, reg: list | None = None,
            root: str = ROOT) -> dict:
    """설계 §6(개정): 제약별 구속도. 판정이 아니라 표다.

    **원본을 다시 채점한다.** 반입 기록의 `violations`는 후처리 **후**의 값이라
    24건이 비어 있다 — 그걸 세면 "아무 제약도 구속하지 않는다"는 거짓 표가 된다.
    채점기는 그대로이고(`pixel_art_style` 원자) 지출은 0이다.
    """
    doc = doc if doc is not None else ai.load_spec()
    reg = reg if reg is not None else jb.load_registry()

    per_rule: dict = {}
    slack: dict = {}
    n_judged, errors = 0, []
    for r in rows:
        path = os.path.join(root, r["source"].replace("\\", os.sep))
        if not os.path.exists(path):
            errors.append({"source": r["source"], "reason": "파일 없음"})
            continue
        try:
            rr, measured = rule_rows(path, r["profile"], doc, reg)
        except Exception as exc:                      # 계측 사고는 숨기지 않는다
            errors.append({"source": r["source"], "reason": str(exc)})
            continue
        n_judged += 1
        cap = doc["profiles"][r["profile"]]["max_logical_size"]
        max_colors = doc["profiles"][r["profile"]]["max_colors"]
        for row in rr:
            d = per_rule.setdefault(row["rule"],
                                    {"violations": 0, "undefined": 0, "n": 0})
            d["n"] += 1
            if row["ok"] is False:
                d["violations"] += 1
            elif row["ok"] is None:
                d["undefined"] += 1
            else:
                # 통과분에서만 여유를 잰다. 잴 수 없는 제약은 비워 둔다.
                if "color" in row["rule"]:
                    c = measured.get("color_count")
                    if isinstance(c, int):
                        slack.setdefault(row["rule"], []).append(max_colors - c)
                elif "size" in row["rule"] or row["rule"].startswith("logical_"):
                    lw = measured.get("logical_width") or measured.get("width")
                    lh = measured.get("logical_height") or measured.get("height")
                    if isinstance(lw, int) and isinstance(lh, int):
                        slack.setdefault(row["rule"], []).append(
                            cap - max(lw, lh))

    out = {}
    for rule, d in sorted(per_rule.items()):
        vals = slack.get(rule)
        rate = d["violations"] / d["n"] if d["n"] else None
        out[rule] = {"binding_rate": rate, "violations": d["violations"],
                     "undefined": d["undefined"], "n": d["n"],
                     "slack_p50": _median(vals) if vals else None,
                     "slack_min": min(vals) if vals else None,
                     "dead_letter": bool(rate == 0 and vals and min(vals) > 0)}
    out["_meta"] = {"judged": n_judged, "errors": errors,
                    "source": "원본 재채점 (기록된 violations는 후처리 후 값)",
                    "note": ("alpha_binary처럼 이진인 제약은 여유가 없다 → "
                             "slack=null이고 사문 판정도 하지 않는다")}
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="data/conformance_q2_v0.json")
    a = ap.parse_args(argv)
    rows = load_rows()
    conf = conformance(rows)
    res = {"spec": "conformance-q2-v0",
           "design": "docs/conformance-cost-q2-v0-design.md",
           "intake": INTAKE, "image_spec": SPEC,
           "thresholds": {"encoding_only_upper": ENCODING_ONLY_UPPER,
                          "content_loss_lower": CONTENT_LOSS_LOWER},
           "bootstrap": {"n": BOOTSTRAP_N, "seed": BOOTSTRAP_SEED},
           "conformance": conf, "binding": binding(rows)}
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)

    c = conf
    print(f"순응 비용 판정: {c['verdict']} ({c['why']})")
    med = "-" if c["median_r"] is None else f"{c['median_r']:.3f}"
    ci = c["ci95"]
    cis = "-" if ci[0] is None else f"[{ci[0]:.3f}, {ci[1]:.3f}]"
    print(f"  median r={med} ci95={cis} "
          f"자산 {c['sample']['assets_used']} 그룹 {c['sample']['groups_used']} "
          f"관문 {c['sample']['gate_ok']}")
    if c["skipped"]:
        print(f"  못 잰 것 {len(c['skipped'])}건")
    print("제약별 구속도 (원본 재채점):")
    for k, v in res["binding"].items():
        if k.startswith("_"):
            continue
        rate = "-" if v["binding_rate"] is None else f"{v['binding_rate']:.3f}"
        sl = "-" if v["slack_p50"] is None else f"{v['slack_p50']}"
        print(f"  {k}: 위반율={rate} ({v['violations']}/{v['n']}) 여유p50={sl}"
              + ("  ← 사문" if v["dead_letter"] else ""))
    print(f"기록: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
