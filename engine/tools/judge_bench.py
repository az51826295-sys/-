"""판단자 v1 — 심판대(judge bench). 설계: docs/judge-design.md

설계도 엔진(tools/blueprint_engine.py)에서 "심판이 있나"를 정하던 것은
레지스트리에 손으로 적은 `verdict: "real"` 라벨과, 실행되지 않는 한국어
`check` 문장뿐이었다. 이 모듈은 그 자리를 **실행되는 심판**으로 바꾼다.

원리 한 줄:
    통과 사례를 통과시키는 것은 심판이 아니다.
    **자기 반례를 거절할 수 있어야** 심판이다.

그래서 real 원자는 `judge` 명세(kind + params + positive + negatives)를
등록하고, 심판대가 그걸 실행해 판정한다:
    teeth        positive 통과 ∧ 모든 negative 거절 ∧ 반례 ≥ 1 ∧ 결정적
    toothless    명세는 있으나 위 조건 미달 (real 자격 없음)
    missing      real인데 judge 명세가 없음
    unfrozen     문턱(spec 값)이 아직 동결되지 않았다 - 판정 자체를 하지 않는다
    human_gate   기계 심판 없음을 명시적으로 선언 (정직한 미분해, 실패 아님)
    unknown_kind / error   명세 오류

심판 종류는 이름으로 분기하지 않고 @kind 레지스트리로 등록한다.
모델 호출 0, 지출 0, 결정적.

  python -X utf8 tools/judge_bench.py --audit
  python -X utf8 tools/judge_bench.py --audit --strict     # real인데 이빨 없으면 종료코드 1
  python -X utf8 tools/judge_bench.py --atom cache_cleanup
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

REGISTRY = os.path.join(ROOT, "data", "capability_atoms.json")
# observed.* 필드의 null 통제 등록부. 여기 통과로 적힌 필드만 판정에 쓰인다.
OBSERVED_CONTROLS = os.path.join(ROOT, "data", "observed_controls.json")


class JudgeError(Exception):
    """심판 명세가 망가졌다(경로 없음, 타입 틀림 등)."""


class Unjudgeable(Exception):
    """기계 심판이 없다고 명시적으로 선언된 항목(사람 눈 게이트)."""


# ------------------------------------------------------------ 종류 레지스트리

KINDS: dict = {}


def kind(name: str):
    """심판 종류를 등록한다. 원자 이름으로 분기하지 않기 위한 장치."""
    def deco(fn):
        KINDS[name] = fn
        return fn
    return deco


def _get(sample: dict, path: str):
    cur = sample
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            raise JudgeError(f"샘플에 경로 없음: {path}")
        cur = cur[part]
    return cur


def _set(sample: dict, path: str, value) -> None:
    parts = path.split(".")
    cur = sample
    for part in parts[:-1]:
        if not isinstance(cur, dict) or part not in cur:
            raise JudgeError(f"변이 경로 없음: {path}")
        cur = cur[part]
    if not isinstance(cur, dict) or parts[-1] not in cur:
        raise JudgeError(f"변이 경로 없음: {path}")
    cur[parts[-1]] = value


def _num(v, path):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise JudgeError(f"{path}는 수여야 한다: {v!r}")
    return v


def _seq(v, path):
    if not isinstance(v, (list, tuple)):
        raise JudgeError(f"{path}는 목록이어야 한다: {v!r}")
    return list(v)


@kind("set_membership")
def _set_membership(params: dict, s: dict) -> bool:
    """보고 목록이 '입력 ∩ 규칙'과 정확히 일치하나. 누락도 과잉도 실패."""
    items = set(_seq(_get(s, params["items"]), params["items"]))
    rule = set(_seq(_get(s, params["rule"]), params["rule"]))
    reported = set(_seq(_get(s, params["reported"]), params["reported"]))
    expected = items & rule
    if not expected:
        raise JudgeError("공허한 샘플: 걸릴 게 하나도 없다(반례 구실을 못 함)")
    return reported == expected


@kind("numeric_delta")
def _numeric_delta(params: dict, s: dict) -> bool:
    """전후 측정 차이가 임계 이상인가(회수 용량 등)."""
    before = _num(_get(s, params["before"]), params["before"])
    after = _num(_get(s, params["after"]), params["after"])
    return (before - after) >= params["min_delta"]


@kind("threshold_desc")
def _threshold_desc(params: dict, s: dict) -> bool:
    """모든 항목이 임계 초과 + 내림차순 정렬인가."""
    items = _seq(_get(s, params["items"]), params["items"])
    if not items:
        raise JudgeError("공허한 샘플: 항목이 비어 있다")
    key, floor = params["key"], params["min_value"]
    vals = [_num(i[key], key) for i in items]
    return all(v >= floor for v in vals) and vals == sorted(vals, reverse=True)


@kind("threshold_match")
def _threshold_match(params: dict, s: dict) -> bool:
    """후보가 보고한 목록 == 측정값에 규칙(임계)을 적용해 나온 목록.

    선언을 측정으로 대조하는 정본 형태(§7.5). 누락도 과잉도 실패."""
    items = _seq(_get(s, params["measured"]), params["measured"])
    claimed = set(_seq(_get(s, params["claim"]), params["claim"]))
    key, id_key = params["key"], params.get("id_key", "path")
    floor = params["min_value"]
    if isinstance(floor, str):                  # spec.* 경로로 준 임계
        floor = _num(_get(s, floor), floor)
    expected = {i[id_key] for i in items if _num(i[key], key) >= floor}
    if not expected:
        raise JudgeError("공허한 샘플: 임계를 넘는 측정 항목이 하나도 없다")
    return claimed == expected


@kind("hash_pairs")
def _hash_pairs(params: dict, s: dict) -> bool:
    """보고한 중복 쌍이 실제로 내용이 같은가."""
    files = _get(s, params["files"])
    pairs = _seq(_get(s, params["pairs"]), params["pairs"])
    if not pairs:
        raise JudgeError("공허한 샘플: 보고된 쌍이 없다")
    for pair in pairs:
        a, b = pair
        if a not in files or b not in files:
            return False
        if files[a] != files[b]:
            return False
    return True


@kind("tag_cover")
def _tag_cover(params: dict, s: dict) -> bool:
    """후보가 설계도 요구 태그를 전부 덮는가(구성 대조의 최소형)."""
    required = set(_seq(_get(s, params["required"]), params["required"]))
    candidate = set(_seq(_get(s, params["candidate"]), params["candidate"]))
    if not required:
        raise JudgeError("공허한 샘플: 요구 태그가 없다(무엇이든 통과)")
    return required <= candidate


@kind("forbidden_absent")
def _forbidden_absent(params: dict, s: dict) -> bool:
    """금지 제약 위반이 없는가(주관적 '재미'는 재지 않는다)."""
    forbidden = _seq(_get(s, params["forbidden"]), params["forbidden"])
    text = _get(s, params["text"])
    if not forbidden:
        raise JudgeError("공허한 샘플: 금지 목록이 비었다(무엇이든 통과)")
    if not isinstance(text, str):
        raise JudgeError("text는 문자열이어야 한다")
    return not any(f in text for f in forbidden)


@kind("all_tests_pass")
def _all_tests_pass(params: dict, s: dict) -> bool:
    """명세 테스트가 전부 통과인가."""
    results = _seq(_get(s, params["results"]), params["results"])
    if not results:
        raise JudgeError("공허한 샘플: 테스트가 0건이다")
    return all(r == "pass" for r in results)


def load_observed_controls(path: str = None) -> dict:
    """observed.* 필드별 null 통제 결과. 파일이 없으면 등록된 필드가 없는 것."""
    path = path or OBSERVED_CONTROLS
    if not os.path.isfile(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f).get("fields", {})


def observed_gate(path: str, controls: dict | None = None) -> str | None:
    """이 observed 필드를 판정에 써도 되나. 쓰면 안 되면 이유 문자열을 준다.

    통제를 통과한 필드만 판정에 쓴다(2026-08-26 승인 C). 미등록·미달은
    fail이 아니라 **undefined** — 못 믿는 재료로 후보를 떨어뜨리지 않는다.
    """
    controls = load_observed_controls() if controls is None else controls
    rec = controls.get(path)
    if rec is None:
        return f"observed 필드 미등록: {path} - null 통제 전에는 판정하지 않는다"
    if not rec.get("null_control_passed"):
        return (f"observed 필드 null 통제 미통과: {path} "
                f'(통과율 {rec.get("null_pass_rate")} > {rec.get("threshold")})')
    return None


def _rule_check(rule: dict, s: dict) -> tuple:
    """규칙 하나를 잰다 → (통과?, 잰 값, 기대). spec_conformance의 단위.

    문턱이 아직 동결되지 않았으면(spec 값이 null) 판정하지 않고 Unjudgeable을
    올린다 — 숫자를 보고 문턱을 정하는 일을 구조적으로 막는다(자산 심판 초안 §6).
    observed.*(추출기가 본 값)도 null 통제 전에는 같은 자리로 보낸다.
    """
    for path in (rule.get("measured"), rule.get("spec")):
        if isinstance(path, str) and path.startswith("observed."):
            why = observed_gate(path)
            if why:
                raise Unjudgeable(why)
    got = _get(s, rule["measured"])
    op = rule["op"]
    want = rule.get("spec")
    if isinstance(want, str) and "." in want:
        want = _get(s, want)
    if want is None and op not in ("empty", "is_null"):
        raise Unjudgeable(
            f'문턱 미동결: {rule.get("name", rule["measured"])} '
            f'({rule.get("spec")}) - 등록 전에는 판정하지 않는다')
    if op == "empty":
        return (not got), got, "비어 있어야 함"
    if op == "is_null":
        return got is None, got, "없어야 함"
    if op == "==":
        return got == want, got, want
    if op in ("<=", ">="):
        if got is None:
            # 재지 못한 값으로 통과·탈락을 만들지 않는다(초안 §6: 추출 실패 = undefined)
            raise Unjudgeable(
                f'측정 없음: {rule.get("name", rule["measured"])} '
                f'({rule["measured"]}) - 잴 도구·입력이 빠졌다')
        v = _num(got, rule["measured"])
        return (v <= want, got, f"<= {want}") if op == "<=" else                (v >= want, got, f">= {want}")
    if op == "subset":
        extra = sorted(set(_seq(got, rule["measured"])) - set(want))
        return (not extra), extra or got, f"{want} 안에만"
    if op == "disjoint":
        hit = sorted(set(_seq(got, rule["measured"])) & set(want))
        return (not hit), hit, f"{want} 없어야 함"
    if op == "all_equal":
        vals = sorted(set(_seq(got, rule["measured"])))
        return vals == [want], vals, f"전부 {want}"
    raise JudgeError(f"모르는 연산: {op!r}")


def explain_conformance(params: dict, s: dict) -> list:
    """규칙별 통과/위반 내역. 고객에게 보여줄 증거이자 재생성 입력."""
    rows = []
    for rule in params.get("rules", []):
        try:
            ok, got, want = _rule_check(rule, s)
        except Unjudgeable as exc:
            rows.append({"rule": rule.get("name", rule["measured"]),
                         "ok": None, "got": "미정의", "want": str(exc),
                         "hidden": bool(rule.get("hidden"))})
            continue
        except JudgeError as exc:
            ok, got, want = False, f"측정 없음({exc})", "-"
        rows.append({"rule": rule.get("name", rule["measured"]), "ok": ok,
                     "got": got, "want": want,
                     "hidden": bool(rule.get("hidden"))})
    return rows


@kind("spec_conformance")
def _spec_conformance(params: dict, s: dict) -> bool:
    """잰 사실들을 설계도 스펙의 규칙 목록과 대조한다. 하나라도 위반이면 실패.

    규칙은 원자가 선언하고(이름 분기 없음), 재료는 measured.*/spec.*에서 온다.
    """
    rules = params.get("rules", [])
    if not rules:
        raise JudgeError("공허한 심판: 규칙이 0건이다")
    rows = explain_conformance(params, s)
    undecided = [r for r in rows if r["ok"] is None]
    if undecided:                      # 문턱 미동결 - 통과도 탈락도 아니다
        raise Unjudgeable("; ".join(r["want"] for r in undecided))
    return all(r["ok"] for r in rows)


@kind("tempo_match")
def _tempo_match(params: dict, s: dict) -> bool:
    """추정 BPM이 설계도 목표와 허용 오차 안인가.

    자산 심판 초안 §6 boundary_rules: **배수 오검출(0.5x·2x)은 fail이 아니라
    undefined**다. 절반/두 배가 목표에 맞으면 판정을 미루고 별도 집계로 보낸다 —
    자기상관 템포 추정의 구조적 한계를 심판이 알고 있는 것이다.
    """
    got = _get(s, params["measured"])
    target = _get(s, params["target"])
    tol = _get(s, params["tolerance"]) if isinstance(params["tolerance"], str)         else params["tolerance"]
    if got is None or target is None:
        raise Unjudgeable("템포 미측정 - 판정하지 않는다")
    if tol is None:
        raise Unjudgeable("문턱 미동결: 템포 허용 오차")
    if abs(got - target) <= tol:
        return True
    for mult in (0.5, 2.0):
        if abs(got * mult - target) <= tol:
            raise Unjudgeable(
                f"배수 오검출 의심(추정 {got} vs 목표 {target}) - "
                f"fail이 아니라 미정의로 보낸다")
    return False


@kind("human_gate")
def _human_gate(params: dict, s: dict) -> bool:
    """기계 심판 없음을 명시적으로 선언한다. 감추는 것보다 낫다."""
    raise Unjudgeable(params.get("why", "기계 분해 미완 - 사람 눈 게이트"))


# ------------------------------------------------------------ 심판 실행

def run_judge(spec: dict, sample: dict) -> bool:
    """심판 하나를 실제로 돌린다. 통과=True."""
    fn = KINDS.get(spec.get("kind"))
    if fn is None:
        raise JudgeError(f"모르는 심판 종류: {spec.get('kind')!r}")
    try:
        return bool(fn(spec.get("params", {}), sample))
    except (KeyError, TypeError, ValueError, IndexError) as exc:
        raise JudgeError(f"{spec.get('kind')} 실행 실패: {exc}") from exc


_PATH_HEADS = ("spec", "measured", "observed", "claim", "input",
               "output")


def decisive_paths(spec: dict) -> list:
    """심판이 실제로 읽는 경로. params 안이면 중첩(규칙 목록)도 훑는다."""
    found = set()

    def walk(node):
        if isinstance(node, str):
            if "." in node and node.split(".")[0] in _PATH_HEADS:
                found.add(node)
        elif isinstance(node, dict):
            for v in node.values():
                walk(v)
        elif isinstance(node, (list, tuple)):
            for v in node:
                walk(v)

    walk(spec.get("params", {}))
    return sorted(found)


def evidence_grade(spec: dict) -> str:
    """재료가 누구 말인가 (§7.3). 이빨과 독립인 두 번째 축.

    measured   기계가 산출물에서 잰 값을 읽는다 → 자율 근거가 된다
    observed   제3의 모델(추출기 G)이 보고 보고한 값 → **자율 근거가 아니다**
               (2026-08-26 사장님 승인 C). null 통제를 통과하기 전에는 판정 자체를
               하지 않는다 - _rule_check가 undefined로 보낸다.
    claim_only 후보의 자기신고(+설계도)만 읽는다 → 통과해도 사람 눈 게이트
    unbound    아직 이름공간에 안 물린 심판(이행 전)

    우선순위는 measured > observed > claim_only다. 후보의 claim을 **재기 위해**
    읽는 심판(claim을 measured와 대조)이 있어서 claim이 섞였다고 등급을 깎지
    않는다. 대신 observed를 읽는 사실 자체는 reads_observed로 따로 드러낸다.
    """
    heads = {p.split(".")[0] for p in decisive_paths(spec)}
    if "measured" in heads:
        return "measured"
    if "observed" in heads:
        return "observed"
    if "claim" in heads:
        return "claim_only"
    return "unbound"


def reads_observed(spec: dict) -> bool:
    """추출기가 본 값을 하나라도 읽는가. 등급이 measured여도 이건 드러낸다."""
    return any(p.startswith("observed.") for p in decisive_paths(spec))


def _negatives(spec: dict) -> list:
    """반례 목록을 만든다. 정본은 positive에서 한 곳만 바꾼 변이."""
    out = []
    for neg in spec.get("negatives", []):
        note = neg.get("note", "")
        if "mutate" in neg:
            sample = copy.deepcopy(spec["positive"])
            for path, value in neg["mutate"].items():
                _set(sample, path, value)
            out.append({"note": note, "origin": "mutation", "sample": sample,
                        "mutated": list(neg["mutate"])})
        elif "sample" in neg:
            out.append({"note": note, "origin": "explicit",
                        "sample": copy.deepcopy(neg["sample"]), "mutated": []})
        else:
            raise JudgeError(f"반례에 mutate도 sample도 없다: {note!r}")
    return out


def bench_atom(atom: dict) -> dict:
    """원자 하나를 심판대에 올린다. 판정 기준은 docs/judge-design.md §5."""
    aid = atom.get("id", "?")
    base = {"atom": aid, "claimed": atom.get("verdict"), "kind": None,
            "teeth": 0, "negatives": [], "straw_risk": False,
            "deterministic": None, "positive_pass": None,
            "evidence": "unbound"}
    spec = atom.get("judge")
    if not spec:
        why = ("real이라고 주장하지만 심판 명세가 없다 - 문장뿐"
               if atom.get("verdict") == "real" else "심판 명세 없음")
        return {**base, "verdict": "missing", "reason": why}
    base["kind"] = spec.get("kind")
    base["evidence"] = evidence_grade(spec)
    if spec.get("kind") not in KINDS:
        return {**base, "verdict": "unknown_kind",
                "reason": f"등록되지 않은 심판 종류: {spec.get('kind')!r}"}
    if spec.get("kind") == "human_gate":
        return {**base, "verdict": "human_gate",
                "reason": spec.get("params", {}).get(
                    "why", "기계 분해 미완 - 사람 눈 게이트")}
    try:
        pos = spec["positive"]
        first = run_judge(spec, copy.deepcopy(pos))
        again = run_judge(spec, copy.deepcopy(pos))
        base["positive_pass"] = first
        base["deterministic"] = first == again
        negs = _negatives(spec)
    except KeyError:
        return {**base, "verdict": "error", "reason": "positive 샘플이 없다"}
    except Unjudgeable as exc:
        # 문턱이 아직 동결되지 않았다 - 이빨이 없는 것과는 다른 상태다
        return {**base, "verdict": "unfrozen", "reason": str(exc)}
    except JudgeError as exc:
        return {**base, "verdict": "error", "reason": str(exc)}

    rows, rejected = [], 0
    for neg in negs:
        try:
            passed = run_judge(spec, copy.deepcopy(neg["sample"]))
            ok = not passed          # 반례는 거절돼야 한다
            note = neg["note"]
        except Unjudgeable as exc:
            # 미정의는 거절이 아니다 - 이빨의 근거로 세지 않는다
            ok, note = False, f'{neg["note"]} (미정의: {exc})'
        except JudgeError as exc:
            # 심판이 반례를 '실행 불가'로 걷어낸 것도 거절로 친다(공허 샘플 방어)
            ok, note = True, f'{neg["note"]} (명세 거절: {exc})'
        rejected += int(ok)
        rows.append({"note": note, "origin": neg["origin"],
                     "mutated": neg["mutated"], "rejected": ok})
    base["negatives"] = rows
    base["teeth"] = rejected
    base["straw_risk"] = any(r["origin"] == "explicit" for r in rows)

    if not base["positive_pass"]:
        return {**base, "verdict": "toothless",
                "reason": "positive 샘플조차 통과시키지 못한다"}
    if not base["deterministic"]:
        return {**base, "verdict": "toothless",
                "reason": "같은 입력에 두 번 다른 판정(비결정적)"}
    if not rows:
        return {**base, "verdict": "toothless",
                "reason": "반례가 0건 - 무엇도 떨어뜨릴 수 없다"}
    if rejected != len(rows):
        missed = [r["note"] for r in rows if not r["rejected"]]
        return {**base, "verdict": "toothless",
                "reason": f"거절하지 못한 반례: {missed}"}
    return {**base, "verdict": "teeth",
            "reason": f"반례 {rejected}건을 모두 거절"}


def load_registry(path: str = REGISTRY) -> list:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def bench_registry(registry: list | None = None) -> dict:
    """레지스트리 전체 감사. 판정: real인 원자는 전부 teeth여야 한다."""
    reg = registry if registry is not None else load_registry()
    rows = [bench_atom(a) for a in reg]
    reals = [r for r in rows if r["claimed"] == "real"]
    teeth = [r for r in reals if r["verdict"] == "teeth"]
    failed = [r for r in reals if r["verdict"] != "teeth"]
    measured = [r for r in teeth if r["evidence"] == "measured"]
    claim_only = [r for r in teeth if r["evidence"] == "claim_only"]
    unbound = [r for r in teeth if r["evidence"] == "unbound"]
    return {
        "rows": rows,
        "summary": {
            "atoms": len(rows),
            "claimed_real": len(reals),
            "with_teeth": len(teeth),
            "without_teeth": len(failed),
            "coverage": round(len(teeth) / len(reals), 4) if reals else 0.0,
            "total_counterexamples": sum(r["teeth"] for r in teeth),
            "straw_risk": sum(1 for r in teeth if r["straw_risk"]),
            "passes_strict": not failed,
            # 두 번째 축(§7.3): 재료가 측정값인가, 후보의 자기신고인가
            "evidence_measured": len(measured),
            "evidence_claim_only": len(claim_only),
            "evidence_unbound": len(unbound),
            "autonomy_ratio": (round(len(measured) / len(teeth), 4)
                               if teeth else 0.0),
        },
        "claim_only": [r["atom"] for r in claim_only],
        "failed": [{"atom": r["atom"], "verdict": r["verdict"],
                    "reason": r["reason"]} for r in failed],
    }


def atom_status(atom: dict, cache: dict | None = None) -> dict:
    """설계도 엔진이 쓰는 축약형 — 이 원자는 기계가 채점하나."""
    if cache is not None and atom.get("id") in cache:
        return cache[atom["id"]]
    r = bench_atom(atom)
    teeth = r["verdict"] == "teeth"
    autonomous = teeth and r["evidence"] == "measured"
    reason = r["reason"]
    if teeth and not autonomous:
        reason = (f'이빨은 있으나 재료가 자기신고/미결합({r["evidence"]}) — '
                  f'후보가 쓴 성적표를 읽는다. 사람 눈 게이트.')
    out = {"verdict": r["verdict"], "kind": r["kind"], "teeth": r["teeth"],
           "evidence": r["evidence"],
           "machine_judged": teeth,          # 심판이 심판인가
           "autonomous": autonomous,         # + 재료가 측정값인가
           "reason": reason}
    if cache is not None:
        cache[atom["id"]] = out
    return out


# ------------------------------------------------------------ CLI

_MARK = {"teeth": "이빨", "toothless": "무딤", "missing": "없음",
         "unfrozen": "미동결",
         "human_gate": "사람눈", "unknown_kind": "종류오류", "error": "오류"}


def _print_audit(res: dict) -> None:
    print("=" * 68)
    print("심판대 감사 — 등록된 심판을 실제로 돌린 결과")
    print("=" * 68)
    for r in res["rows"]:
        mark = _MARK.get(r["verdict"], r["verdict"])
        claim = r["claimed"]
        ev = {"measured": "측정", "claim_only": "자기신고",
              "unbound": "미결합"}.get(r["evidence"], r["evidence"])
        print(f'  [{mark:^4}] {r["atom"]:<28} 주장={claim:<10} '
              f'종류={r["kind"] or "-"} 반례={r["teeth"]} 재료={ev}')
        if r["verdict"] not in ("teeth", "human_gate"):
            print(f'          ↳ {r["reason"]}')
        elif r["straw_risk"]:
            print("          ↳ 주의: 직접 작성 반례 포함(변이 반례가 정본)")
    s = res["summary"]
    print("-" * 68)
    print(f'  real 주장 {s["claimed_real"]}건 중 이빨 있음 {s["with_teeth"]}건 '
          f'(커버리지 {s["coverage"]:.0%}), 반례 총 {s["total_counterexamples"]}건')
    print(f'  재료: 측정 {s["evidence_measured"]} / 자기신고 '
          f'{s["evidence_claim_only"]} / 미결합 {s["evidence_unbound"]} '
          f'→ 자율 가능 {s["autonomy_ratio"]:.0%}')
    if res.get("claim_only"):
        print(f'  ⚠ 자기신고에만 기대는 항목: {", ".join(res["claim_only"])}')
    if res["failed"]:
        print("  ✖ 심판 없는 real:")
        for f in res["failed"]:
            print(f'      - {f["atom"]} [{_MARK.get(f["verdict"])}]: {f["reason"]}')
    else:
        print("  ✔ real 원자는 전부 자기 반례를 거절한다")


def main(argv=None):
    ap = argparse.ArgumentParser(description="판단자 v1 — 심판대")
    ap.add_argument("--audit", action="store_true", help="레지스트리 전체 감사")
    ap.add_argument("--atom", default=None, help="원자 하나만 상세 판정")
    ap.add_argument("--strict", action="store_true",
                    help="real인데 이빨 없는 원자가 있으면 종료코드 1")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    reg = load_registry()
    if args.atom:
        atom = next((a for a in reg if a["id"] == args.atom), None)
        if atom is None:
            print(f"그런 원자 없음: {args.atom}")
            return 2
        res = bench_atom(atom)
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0 if res["verdict"] in ("teeth", "human_gate") else 1
    res = bench_registry(reg)
    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        _print_audit(res)
    if args.strict and not res["summary"]["passes_strict"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
