"""observed.* 필드의 null 통제 하네스 — 등록 절차를 코드로 못박는다.

`observed.*`는 추출기 G가 **본** 값이다(자율 근거 아님). 등록되지 않은 필드는
판정에 못 쓰고(`judge_bench.observed_gate`), 등록은 오직 이 통제의 결과로만
한다 — `data/observed_controls.json`을 손으로 채우지 않는다.

**통제의 내용**: 자산과 라벨을 **어긋나게** 짝지었을 때도 G의 답이 맞아떨어지면,
그 필드는 자산을 보고 있는 게 아니다. 어긋난 짝의 일치율이 문턱(0.05) 이하여야
등록된다.

  python -X utf8 tools/observed_null.py --manifest data/observed/art_style.json
  python -X utf8 tools/observed_null.py --manifest ... --provider anthropic
      --register --by 사장님          # 실호출 + 등록은 승인 시에만

**목(mock)으로는 등록되지 않는다.** 목은 절차를 시험하는 것이지 증거가 아니다.

**라벨이 쏠리면 통제가 정의되지 않는다**(fail 아님 → undefined). 라벨이 전부
같으면 아무렇게나 짝지어도 맞아떨어지므로, 그때 나오는 높은 일치율은 필드의
잘못이 아니라 표본의 잘못이다. 아이콘 골든 null 0.125가 정확히 그 그림이었다
(docs/icon-golden-v1-brief.md §3) — 같은 함정을 두 번 밟지 않으려고 우연 바닥을
먼저 계산한다.
"""
from __future__ import annotations

import argparse
import itertools
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from tools import extractor_g                            # noqa: E402
from tools import judge_bench                            # noqa: E402

CONTROLS = judge_bench.OBSERVED_CONTROLS
N_MIN = 20                      # 어긋난 짝의 최소 수(골든 null과 같은 값)


def load_manifest(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)
    if doc.get("field") not in extractor_g.FIELDS:
        raise KeyError(f"등록되지 않은 observed 필드: {doc.get('field')}")
    if len(doc.get("assets", [])) < 2:
        raise ValueError("자산이 2건 미만이면 어긋난 짝을 만들 수 없다")
    for a in doc["assets"]:
        if not a.get("label"):
            raise ValueError(f"라벨 없는 자산: {a.get('id')}")
    return doc


def _artifact(asset: dict) -> str:
    if asset.get("artifact") is not None:
        return asset["artifact"]
    with open(asset["artifact_path"], encoding="utf-8") as f:
        return f.read()


def chance_floor(labels: list) -> float:
    """무작위 재짝지음에서 **그냥 맞을** 비율. 자산 i에 j(≠i)의 라벨을 붙였을
    때 같은 라벨일 확률의 평균이다. 이 값이 문턱보다 크면 통제는 정의되지 않는다.
    """
    n = len(labels)
    if n < 2:
        return 1.0
    same = sum(1 for i, j in itertools.permutations(range(n), 2)
               if labels[i] == labels[j])
    return same / (n * (n - 1))


def _threshold(path: str = None) -> float:
    """문턱은 등록부에서만 읽는다. 명령줄로 낮출 수 없다."""
    path = path or CONTROLS
    if not os.path.isfile(path):
        return 0.05
    with open(path, encoding="utf-8") as f:
        return json.load(f).get("threshold", 0.05)


def run(manifest: dict, extractor, k: int = extractor_g.K,
        threshold: float | None = None) -> dict:
    field = manifest["field"]
    assets = manifest["assets"]
    threshold = _threshold() if threshold is None else threshold

    rows = []
    for a in assets:
        obs = extractor_g.observe(_artifact(a), field, extractor, k=k)
        rows.append({"id": a["id"], "label": a["label"],
                     "observed": obs["value"], "decided": obs["decided"],
                     "tally": obs["tally"], "invalid": obs["invalid"]})

    decided = [r for r in rows if r["decided"]]
    self_hits = sum(1 for r in decided if r["observed"] == r["label"])
    mis = [(r, o) for r in decided for o in decided if r["id"] != o["id"]]
    null_hits = sum(1 for r, o in mis if r["observed"] == o["label"])

    floor = chance_floor([r["label"] for r in decided])
    rate = (null_hits / len(mis)) if mis else None
    verdict, why = "PASS", None
    if len(mis) < N_MIN:
        verdict, why = "UNDEFINED", f"어긋난 짝 {len(mis)} < 최소 {N_MIN}"
    elif floor > threshold:
        verdict = "UNDEFINED"
        why = (f"라벨 쏠림: 우연 바닥 {floor:.4f} > 문턱 {threshold} - "
               f"이 표본으로는 통제가 정의되지 않는다(라벨을 고르게 모을 것)")
    elif rate > threshold:
        verdict, why = "FAIL", f"어긋난 짝 일치율 {rate:.4f} > {threshold}"

    return {
        "field": f"observed.{field}", "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "extractor": extractor.name,
        "model": getattr(extractor, "model", "mock"),
        "extractor_version": extractor_g.EXTRACTOR_VERSION,
        "mock": extractor.name == "mock", "k": k,
        "n_assets": len(assets), "n_decided": len(decided),
        "n_undecided": len(assets) - len(decided),
        "n_mispairs": len(mis), "threshold": threshold,
        "null_pass_rate": None if rate is None else round(rate, 6),
        "chance_floor": round(floor, 6),
        "self_match_rate": (round(self_hits / len(decided), 6)
                            if decided else None),
        "verdict": verdict, "why": why, "rows": rows,
        "usd": round(getattr(extractor, "spent_here", 0.0), 6),
    }


def register(result: dict, by: str, path: str = None) -> dict:
    """통제를 통과한 필드만 등록부에 올린다. 목·미정의·미달은 거부."""
    path = path or CONTROLS
    if result["mock"]:
        raise PermissionError("목 실행은 등록하지 않는다 - 절차 시험일 뿐이다")
    if result["verdict"] != "PASS":
        raise PermissionError(
            f"{result['verdict']} 상태로는 등록하지 않는다: {result['why']}")
    if not by:
        raise ValueError("등록자(--by)가 필요하다")
    doc = {"version": 1, "threshold": result["threshold"], "fields": {}}
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            doc = json.load(f)
    doc.setdefault("fields", {})[result["field"]] = {
        "null_control_passed": True,
        "null_pass_rate": result["null_pass_rate"],
        "threshold": result["threshold"],
        "chance_floor": result["chance_floor"],
        "n_mispairs": result["n_mispairs"],
        "self_match_rate": result["self_match_rate"],
        "extractor_version": result["extractor_version"],
        "model": result["model"], "registered_at": result["ts"],
        "registered_by": by,
    }
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    return doc


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="observed.* null 통제")
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--provider", default="mock",
                    choices=["mock", "anthropic"])
    ap.add_argument("--model", default=extractor_g.DEFAULT_MODEL)
    ap.add_argument("--max-usd", type=float, default=0.05)
    ap.add_argument("--k", type=int, default=extractor_g.K)
    ap.add_argument("--out", default=None)
    ap.add_argument("--register", action="store_true")
    ap.add_argument("--by", default=None)
    a = ap.parse_args(argv)

    doc = load_manifest(a.manifest)
    ex = extractor_g.make_extractor(a.provider, a.model, a.max_usd)
    res = run(doc, ex, k=a.k)

    tail = f" — {res['why']}" if res["why"] else ""
    print(f"{res['field']}  판정 {res['verdict']}{tail}")
    print(f"  어긋난 짝 일치율 {res['null_pass_rate']} (문턱 "
          f"{res['threshold']}, 우연 바닥 {res['chance_floor']})")
    print(f"  제자리 일치율 {res['self_match_rate']}  ·  미결정 "
          f"{res['n_undecided']}/{res['n_assets']}  ·  지출 ${res['usd']:.6f}")
    if res["mock"]:
        print("  목 실행 — 등록 불가(절차 시험용).")

    if a.out:
        os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
        with open(a.out, "w", encoding="utf-8", newline="\n") as f:
            json.dump(res, f, ensure_ascii=False, indent=2)
        print(f"  기록: {a.out}")

    if a.register:
        try:
            register(res, a.by)
        except (PermissionError, ValueError) as exc:
            print(f"  등록 거부: {exc}")
            return 2
        print(f"  등록 완료: {res['field']} (by {a.by})")
    return 0 if res["verdict"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
