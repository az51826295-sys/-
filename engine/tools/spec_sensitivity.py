"""스펙 민감도 — 설계도를 바꾸면 판정이 따라 바뀌나.

사전 등록: `docs/spec-sensitivity-v1-design.md`(구성 규칙·문턱 1.0·미정의 조건).
상속: `judge-bench-v1.2`.

이빨(`judge_bench --audit`)은 `measured.*`(후보 쪽)를 비틀어 "나쁜 후보를
떨어뜨리나"를 본다. 여기서는 `spec.*`(설계도 쪽)을 비틀어 **"설계도를 실제로
읽나"** 를 본다. 통과 도장만 찍는 심판, 스펙을 참조하는 척하고 상수를 비교하는
심판은 여기서 걸린다.

우리 제품의 판정은 "절대적으로 좋은가"가 아니라 "설계도에 맞나"이므로,
설계도가 바뀌었는데 판정이 그대로인 심판은 정의상 심판이 아니다.

  python -X utf8 tools/spec_sensitivity.py            # 표로 본다
  python -X utf8 tools/spec_sensitivity.py --strict   # 미달이면 종료코드 1
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from tools import judge_bench as jb                      # noqa: E402

# 동결(설계 §2·부록 A2). 결과를 보고 내리지 않는다.
THRESHOLD = 1.0
MIN_CONSTRUCTIONS = 3           # spec_conformance 전용(규칙이 여럿인 심판)
MIN_CONSTRUCTIONS_EXHAUSTIVE = 1  # 종류별 전수 구성(설계도 입력을 다 덮는다)
SUPPORTED_KIND = "spec_conformance"
NOT_SPEC_DEPENDENT = ("empty", "is_null")

# 설계도가 관여하지 않는 심판 — 민감도를 물을 수 없다(부록 A1). 결함이 아니라 성질.
NO_SPEC_KINDS = {
    "hash_pairs": "설계도 입력이 없는 심판(claim↔measured 자기일관성 검사)",
}

# 종류별 구성기 등록부. 이름 분기 대신 등록으로 늘린다(심판대 규율 5).
KIND_BUILDERS = {}


def kind_builder(name: str):
    def deco(fn):
        KIND_BUILDERS[name] = fn
        return fn
    return deco


def _bump(value):
    """이 값과 **다른** 값 하나. 수는 +1, 글자는 뒤에 표식, 목록은 원소 추가."""
    if isinstance(value, bool):
        return not value
    if isinstance(value, (int, float)):
        return value + 1
    if isinstance(value, str):
        return value + "_x"
    if isinstance(value, list):
        return value + ["_x"]
    return "_x"


def _spec_path(rule: dict) -> str | None:
    want = rule.get("spec")
    return want if isinstance(want, str) and "." in want else None


def _new_spec_value(rule: dict, measured, want):
    """이 규칙을 **정의상 위반**으로 만드는 새 스펙 값. 못 만들면 (None, 사유)."""
    op = rule["op"]
    if op == "==":
        return _bump(measured if measured is not None else want), None
    if op == "<=":
        if not isinstance(measured, (int, float)):
            return None, "잰 값이 수가 아니다"
        return measured - 1, None
    if op == ">=":
        if not isinstance(measured, (int, float)):
            return None, "잰 값이 수가 아니다"
        return measured + 1, None
    if op == "all_equal":
        vals = measured if isinstance(measured, list) else [measured]
        if not vals:
            return None, "잰 목록이 비어 있다"
        v = vals[0]
        return (v + 0.5 if isinstance(v, (int, float)) else str(v) + "_x"), None
    if op == "subset":
        if not measured:
            return None, "잰 목록이 비어 있다 - 뺄 원소가 없다"
        allowed = [x for x in (want or []) if x != measured[0]]
        return allowed, None
    if op == "disjoint":
        if not measured:
            return None, "잰 목록이 비어 있다 - 넣을 원소가 없다"
        return list(want or []) + [measured[0]], None
    return None, f"구성 규칙이 없는 연산: {op}"


def constructions(atom: dict) -> list:
    """규칙마다 '설계도만 비튼' 시료를 만든다. `measured.*`는 손대지 않는다."""
    spec = atom["judge"]
    sample = copy.deepcopy(spec["positive"])
    out = []
    for idx, rule in enumerate(spec.get("params", {}).get("rules", [])):
        name = rule.get("name", rule.get("measured", f"rule{idx}"))
        if rule["op"] in NOT_SPEC_DEPENDENT:
            out.append({"rule": name, "constructible": False,
                        "why": f'{rule["op"]}는 스펙을 참조하지 않는다'})
            continue
        measured = jb._get(sample, rule["measured"])
        path = _spec_path(rule)
        want = jb._get(sample, path) if path else rule.get("spec")
        new_value, why = _new_spec_value(rule, measured, want)
        if new_value is None:
            out.append({"rule": name, "constructible": False, "why": why})
            continue

        new_sample = copy.deepcopy(sample)
        new_spec = copy.deepcopy(spec)
        if path:                       # spec.* 경로면 표본의 설계도 가지를
            node, _sep, leaf = path.rpartition(".")
            jb._get(new_sample, node)[leaf] = new_value
        else:                          # 규칙에 박힌 값이면 규칙 사본을
            new_spec["params"]["rules"][idx]["spec"] = new_value
        out.append({"rule": name, "constructible": True,
                    "was": want, "now": new_value,
                    "sample": new_sample, "spec": new_spec})
    return out


@kind_builder("set_membership")
def _build_set_membership(spec: dict, sample: dict) -> list:
    """규칙 목록(설계도)을 비튼다. 보고(claim)는 그대로 둔다."""
    params = spec["params"]
    items = list(jb._seq(jb._get(sample, params["items"]), params["items"]))
    rule = list(jb._seq(jb._get(sample, params["rule"]), params["rule"]))
    hits = [i for i in items if i in rule]
    misses = [i for i in items if i not in rule]
    out = []
    if len(hits) >= 2:      # 적중이 하나뿐이면 빼는 순간 '공허한 샘플'이 된다
        out.append(("규칙에서 적중 제거", params["rule"],
                    [r for r in rule if r != hits[0]]))
    else:
        out.append(("규칙에서 적중 제거", None,
                    "적중이 1건뿐 - 빼면 공허한 샘플이 된다"))
    if misses:
        out.append(("규칙에 미적중 추가", params["rule"], rule + [misses[0]]))
    else:
        out.append(("규칙에 미적중 추가", None, "미적중 원소가 없다"))
    return out


@kind_builder("numeric_delta")
def _build_numeric_delta(spec: dict, sample: dict) -> list:
    params = spec["params"]
    before = jb._num(jb._get(sample, params["before"]), params["before"])
    after = jb._num(jb._get(sample, params["after"]), params["after"])
    return [("임계를 실제 차이 초과로", "params.min_delta",
             (before - after) + 1)]


@kind_builder("threshold_match")
def _build_threshold_match(spec: dict, sample: dict) -> list:
    params = spec["params"]
    items = list(jb._seq(jb._get(sample, params["measured"]),
                         params["measured"]))
    key = params["key"]
    floor = params["min_value"]
    path = floor if isinstance(floor, str) else None
    if path:
        floor = jb._num(jb._get(sample, path), path)
    target = path or "params.min_value"
    above = sorted(jb._num(i[key], key) for i in items
                   if jb._num(i[key], key) >= floor)
    below = sorted((jb._num(i[key], key) for i in items
                    if jb._num(i[key], key) < floor), reverse=True)
    out = []
    if len(above) >= 2:     # 적중이 하나뿐이면 올리는 순간 공허한 샘플
        out.append(("임계를 올려 적중 하나 제외", target, above[0] + 1))
    else:
        out.append(("임계를 올려 적중 하나 제외", None,
                    "적중이 1건뿐 - 올리면 공허한 샘플이 된다"))
    if below:
        out.append(("임계를 내려 미적중 하나 포함", target, below[0]))
    else:
        out.append(("임계를 내려 미적중 하나 포함", None,
                    "임계 아래 항목이 없다"))
    return out


@kind_builder("forbidden_absent")
def _build_forbidden_absent(spec: dict, sample: dict) -> list:
    """금지 목록에 **본문에 실제로 있는** 낱말을 넣는다."""
    params = spec["params"]
    forbidden = list(jb._seq(jb._get(sample, params["forbidden"]),
                             params["forbidden"]))
    text = jb._get(sample, params["text"])
    words = sorted((w.strip(".,!?\"'") for w in str(text or "").split()),
                   key=len, reverse=True)
    word = next((w for w in words if len(w) >= 2), None)
    if not word:
        return [("금지 목록에 본문 낱말 추가", None, "본문에서 낱말을 못 뽑았다")]
    return [("금지 목록에 본문 낱말 추가", params["forbidden"],
             forbidden + [word])]


def constructions_by_kind(atom: dict) -> list:
    """spec_conformance가 아닌 종류의 구성(부록 A1). 설계도 쪽만 비튼다."""
    spec = atom["judge"]
    sample = copy.deepcopy(spec["positive"])
    builder = KIND_BUILDERS.get(spec.get("kind"))
    if builder is None:
        return []
    out = []
    for name, target, value in builder(spec, sample):
        if target is None:              # 구성 조건을 못 채운 경우
            out.append({"rule": name, "constructible": False, "why": value})
            continue
        new_sample = copy.deepcopy(sample)
        new_spec = copy.deepcopy(spec)
        if target.startswith("params."):
            new_spec["params"][target.split(".", 1)[1]] = value
            was = spec["params"][target.split(".", 1)[1]]
        else:
            node, _sep, leaf = target.rpartition(".")
            was = copy.deepcopy(jb._get(sample, target))
            jb._get(new_sample, node)[leaf] = value
        out.append({"rule": name, "constructible": True, "was": was,
                    "now": value, "sample": new_sample, "spec": new_spec})
    return out


def run_atom(atom: dict) -> dict:
    """원자 하나의 뒤집힘률. 판정은 세 값(통과/미달/미정의)이다."""
    aid = atom.get("id", "?")
    spec = atom.get("judge") or {}
    base = {"atom": aid, "kind": spec.get("kind"), "claimed": atom.get("verdict"),
            "n": 0, "flipped": 0, "rate": None, "rows": []}
    if atom.get("verdict") != "real":
        return {**base, "state": "skipped",
                "why": "real 주장이 아니다 - 민감도를 묻지 않는다"}
    kind = spec.get("kind")
    if kind in NO_SPEC_KINDS:
        return {**base, "state": "undefined", "why": NO_SPEC_KINDS[kind]}
    if kind != SUPPORTED_KIND and kind not in KIND_BUILDERS:
        return {**base, "state": "undefined",
                "why": f'구성 규칙 없음(종류 {kind!r}) - '
                       f'없는 관문을 있는 척하지 않는다'}
    try:
        if not jb.run_judge(spec, copy.deepcopy(spec["positive"])):
            return {**base, "state": "error",
                    "why": "positive 표본이 통과하지 않는다 - 민감도 이전의 문제"}
    except (jb.JudgeError, jb.Unjudgeable, KeyError) as exc:
        return {**base, "state": "error", "why": f"positive 실행 실패: {exc}"}

    exhaustive = kind != SUPPORTED_KIND
    built = constructions_by_kind(atom) if exhaustive else constructions(atom)
    rows = []
    for c in built:
        if not c["constructible"]:
            rows.append({"rule": c["rule"], "flipped": None, "why": c["why"]})
            continue
        try:
            passed = jb.run_judge(c["spec"], c["sample"])
            flipped, why = (not passed), None
        except jb.Unjudgeable as exc:
            # 미정의는 뒤집힘이 아니다(규율 4를 뒤집지 않는다)
            flipped, why = False, f"미정의: {exc}"
        except jb.JudgeError as exc:
            flipped, why = False, f"오류: {exc}"
        rows.append({"rule": c["rule"], "flipped": flipped,
                     "was": c["was"], "now": c["now"], "why": why})

    usable = [r for r in rows if r["flipped"] is not None]
    n = len(usable)
    flipped = sum(1 for r in usable if r["flipped"])
    rate = round(flipped / n, 4) if n else None
    out = {**base, "n": n, "flipped": flipped, "rate": rate, "rows": rows}
    floor_n = (MIN_CONSTRUCTIONS_EXHAUSTIVE if exhaustive
               else MIN_CONSTRUCTIONS)
    out["exhaustive"] = exhaustive
    if n < floor_n:
        return {**out, "state": "undefined",
                "why": f"구성 {n} < 최소 {floor_n} - 말할 것이 없다"}
    if rate < THRESHOLD:
        bad = [r["rule"] for r in usable if not r["flipped"]]
        return {**out, "state": "fail",
                "why": f'설계도를 안 읽는 규칙: {", ".join(bad)}'}
    return {**out, "state": "pass", "why": None}


def run_registry(registry: list | None = None) -> dict:
    reg = registry if registry is not None else jb.load_registry()
    rows = [run_atom(a) for a in reg]
    graded = [r for r in rows if r["state"] in ("pass", "fail")]
    return {
        "threshold": THRESHOLD, "min_constructions": MIN_CONSTRUCTIONS,
        "rows": rows,
        "summary": {
            "graded": len(graded),
            "passed": sum(1 for r in graded if r["state"] == "pass"),
            "failed": sum(1 for r in graded if r["state"] == "fail"),
            "undefined": sum(1 for r in rows if r["state"] == "undefined"),
            "constructions": sum(r["n"] for r in rows),
            "passes_strict": all(r["state"] == "pass" for r in graded),
        },
    }


_MARK = {"pass": "통과", "fail": "미달", "undefined": "미정의",
         "skipped": "해당없음", "error": "오류"}


def _print(res: dict, verbose: bool = False) -> None:
    print("=" * 70)
    print("스펙 민감도 — 설계도를 바꾸면 판정이 따라 바뀌나")
    print("=" * 70)
    for r in res["rows"]:
        if r["state"] == "skipped":
            continue
        rate = "  -  " if r["rate"] is None else f'{r["rate"]:.2f}'
        print(f'  [{_MARK[r["state"]]:5s}] {r["atom"]:28s} '
              f'구성 {r["n"]:2d}  뒤집힘 {rate}')
        if r["why"]:
            print(f'          → {r["why"]}')
        if verbose:
            for row in r["rows"]:
                mark = {True: "뒤집힘", False: "그대로",
                        None: "구성불가"}[row["flipped"]]
                extra = f'  ({row["why"]})' if row.get("why") else ""
                print(f'            {mark}  {row["rule"]}{extra}')
    s = res["summary"]
    print("-" * 70)
    print(f'  채점 {s["graded"]}건 중 통과 {s["passed"]} / 미달 {s["failed"]}'
          f'  ·  미정의 {s["undefined"]}건  ·  구성 총 {s["constructions"]}개')
    print(f'  문턱 {res["threshold"]} (구성 가능한 규칙은 전부 뒤집혀야 한다)')


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="스펙 민감도(설계도 읽기 검사)")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--record")
    a = ap.parse_args(argv)
    res = run_registry()
    if a.record:
        os.makedirs(os.path.dirname(a.record) or ".", exist_ok=True)
        with open(a.record, "w", encoding="utf-8", newline="\n") as f:
            json.dump(res, f, ensure_ascii=False, indent=2, default=str)
    if a.json:
        print(json.dumps(res, ensure_ascii=False, indent=2, default=str))
    else:
        _print(res, verbose=a.verbose)
    return 0 if (not a.strict or res["summary"]["passes_strict"]) else 1


if __name__ == "__main__":
    sys.exit(main() or 0)
