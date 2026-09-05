"""심판자(Judge) v1 — 사용자 확정본(2026-08-15)의 기계 구현.

계약: J(evidence, criterion) → {통과, 미통과, 미정의}
- 순수 함수·결정론. 모델 호출 없음. 시각·환경·순서 비의존.
- `미정의`는 실패가 아니라 정상 반환값이다.

5층: ① 적격성 게이트(계측기 상태가 필수 입력) → ② 조작화
(원시 로그 → Construct, 판정 규칙은 construct 이름만 참조) →
③ 분할(상호배타·전수 — check_partition으로 기계 검사) →
④ 마진 ε=k·σ + 3갈래 방향 → ⑤ 감사(다른 종류의 계산으로
이중 판정 — 훅).

기준은 YAML 스펙 우선, criterion_id+version+hash로 고정. 표현
불가한 기준만 함수로 탈출하되 탈출 자체가 레코드로 남는다.

골든 5종(tests/fixtures/judge/) 통과 전 배포 금지.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field

import yaml

PASS, FAIL, UNDEFINED = "통과", "미통과", "미정의"
A_WINS, B_WINS, INDISTINCT = "A_wins", "B_wins", "indistinguishable"

# 탈출 함수 등록부 - 스펙으로 표현 불가한 기준만. 등록 자체가
# 스펙 설계 부족의 카운터다.
ESCAPE_REGISTRY: dict[str, callable] = {}


def register_escape(name: str):
    def deco(fn):
        ESCAPE_REGISTRY[name] = fn
        return fn
    return deco


@dataclass(frozen=True)
class Criterion:
    criterion_id: str
    version: int
    spec_hash: str
    eligibility: dict
    constructs: list
    margin: dict
    decision: dict
    escape_fn: str | None = None
    raw_text: str = ""


def load_criterion(path: str) -> Criterion:
    with open(path, encoding="utf-8") as f:
        text = f.read()
    d = yaml.safe_load(text)
    return Criterion(
        criterion_id=d["criterion_id"],
        version=int(d["version"]),
        spec_hash=hashlib.sha1(text.encode()).hexdigest()[:12],
        eligibility=d.get("eligibility", {}),
        constructs=d.get("constructs", []),
        margin=d.get("margin", {"k": 1.0, "sigma": 0.0}),
        decision=d.get("decision", {}),
        escape_fn=d.get("escape_fn"),
        raw_text=text)


@dataclass
class JudgeResult:
    verdict: str                       # 통과/미통과/미정의
    branch: str | None                 # A_wins/B_wins/indistinguishable
    criterion_id: str = ""
    version: int = 0
    spec_hash: str = ""
    layer: str = ""                    # 판정이 결정된 층
    layers_exercised: list = field(default_factory=list)
    detail: dict = field(default_factory=dict)
    escaped: bool = False
    audit: dict | None = None

    def record(self) -> dict:
        """승격 레코드 verification_rule 필드와 같은 구조.
        layers_exercised: 실제로 실행된 층 - 문턱 판정은 4층
        (마진·방향)이 돌지 않으므로, '심판자 실전 검증됨'이 절반만
        돈 상태로 기록에 남지 않게 명시한다 (2026-08-15 확정)."""
        return {"criterion_id": self.criterion_id,
                "version": self.version, "hash": self.spec_hash,
                "verdict": self.verdict, "branch": self.branch,
                "layer": self.layer,
                "layers_exercised": list(self.layers_exercised),
                "escaped": self.escaped}


# ------------------------------------------------- 1층: 적격성 게이트


def _eligibility(evidence: dict, crit: Criterion) -> dict | None:
    """미달 항목 dict를 반환하면 즉시 미정의. None이면 통과.
    계측기 상태(stale·unknown·unresolved)가 심판자의 필수 입력."""
    e = crit.eligibility
    inst = evidence.get("instrument", {})
    fails = {}
    for arm, data in evidence.items():
        if arm == "instrument":
            continue
        n = data.get("n_runs", 0)
        if n < e.get("min_runs_per_arm", 0):
            fails[f"{arm}.n_runs"] = n
        comp = data.get("completion_rate", 1.0)
        if comp < e.get("min_completion_rate", 0.0):
            fails[f"{arm}.completion_rate"] = comp
    for key, cap_key in (("stale_rate", "max_stale_rate"),
                         ("unknown_rate", "max_unknown_rate"),
                         ("unresolved_rate", "max_unresolved_rate")):
        if cap_key in e and inst.get(key) is not None \
                and inst[key] > e[cap_key]:
            fails[f"instrument.{key}"] = inst[key]
    return fails or None


# ---------------------------------------------------- 2층: 조작화


def _constructs(arm_data: dict, crit: Criterion) -> dict:
    """원시 로그 -> Construct. 판정 층은 이 dict만 본다 - 원시
    필드 직접 참조는 구조적으로 불가능하다 (P30류는 이 층에서만
    잡힌다). 미정의 construct는 None."""
    out = {}
    for c in crit.constructs:
        kind = c.get("formula", "ratio")
        src = c["derived_from"]
        if kind == "ratio":
            num = arm_data.get(src[0])
            den = arm_data.get(src[1])
            out[c["name"]] = (None if not den else
                              (None if num is None else num / den))
        elif kind == "identity":
            out[c["name"]] = arm_data.get(src[0])
        else:
            raise ValueError(f"unknown formula: {kind}")
    return out


# ------------------------------------------- 3층·4층: 분할과 마진


def _decide(ca: dict, cb: dict, crit: Criterion) -> tuple[str, dict]:
    """상호배타·전수 3분할: A 우위 / B 우위 / 구별 불가.
    ε = k·σ (사전 등록). construct 미정의 -> ('미정의', ...)."""
    metric = crit.decision["metric"]
    better = crit.decision.get("better", "lower")
    a, b = ca.get(metric), cb.get(metric)
    if a is None or b is None:
        return UNDEFINED, {"metric": metric, "a": a, "b": b,
                           "reason": "construct 미정의"}
    eps = float(crit.margin.get("k", 1.0)) * \
        float(crit.margin.get("sigma", 0.0))
    diff = a - b
    if abs(diff) <= eps:
        return INDISTINCT, {"a": a, "b": b, "eps": eps}
    winner_is_a = (diff < 0) if better == "lower" else (diff > 0)
    return (A_WINS if winner_is_a else B_WINS), \
        {"a": a, "b": b, "eps": eps}


def check_partition(crit: Criterion, n: int = 500) -> None:
    """분기 집합의 상호배타·전수성 기계 검사. 무작위 결과 벡터
    N개(동률·역방향·성공 0 명시 포함)가 각각 정확히 하나의 출력에
    매칭되는지 assert. 결정론(고정 seed)."""
    import random
    rng = random.Random(20260815)
    cases = [(30.0, 30.0), (30.0, 30.0 + crit.margin.get("sigma", 0)
              * crit.margin.get("k", 1.0)),      # 경계 동률
             (50.0, 20.0), (20.0, 50.0),          # 양방향
             (None, 30.0), (None, None)]          # 성공 0
    for _ in range(n):
        cases.append((rng.uniform(0, 100), rng.uniform(0, 100)))
    outs = {A_WINS, B_WINS, INDISTINCT, UNDEFINED}
    metric = crit.decision["metric"]
    for a, b in cases:
        branch, _ = _decide({metric: a}, {metric: b}, crit)
        assert branch in outs, f"분기 밖 출력: {branch}"
        # 정확히 하나: _decide는 단일 반환이므로 배타성은 구조적,
        # 전수성은 위 assert가 검사한다.


# ------------------------------------------------------- 진입점


def judge(evidence: dict, crit: Criterion,
          audit_fn=None) -> JudgeResult:
    """J(evidence, criterion) -> 통과/미통과/미정의.

    evidence = {"A": {...원시...}, "B": {...원시...},
                "instrument": {stale_rate, unknown_rate,
                unresolved_rate}}
    verdict 의미: decision.expect가 있으면 그 분기와 일치=통과,
    타 분기=미통과; 없으면 branch 자체가 산출물이고 verdict은
    분기 확정=통과 / 구별 불가=미통과 / 미정의=미정의.
    """
    base = dict(criterion_id=crit.criterion_id, version=crit.version,
                spec_hash=crit.spec_hash)

    # 탈출 경로: 스펙으로 표현 불가한 기준. 레코드에 escaped 명시.
    if crit.escape_fn:
        fn = ESCAPE_REGISTRY[crit.escape_fn]
        v, detail = fn(evidence)
        return JudgeResult(verdict=v, branch=None, layer="escape",
                           layers_exercised=["escape"],
                           detail=detail, escaped=True, **base)

    fails = _eligibility(evidence, crit)
    if fails is not None:
        return JudgeResult(verdict=UNDEFINED, branch=None,
                           layer="eligibility",
                           layers_exercised=["eligibility"],
                           detail={"fails": fails}, **base)

    # 문턱 판정 모드 (decision.kind == threshold): 단일 대상의
    # 합격 조건 전수 검사. 1층·2층·3층(자명 분할)만 돌고 4층은
    # 돌지 않는다 - layers_exercised가 그 사실을 기록한다.
    if crit.decision.get("kind") == "threshold":
        subject = evidence.get("subject", {})
        cs = _constructs(subject, crit)
        if any(v is None for v in cs.values()):
            return JudgeResult(
                verdict=UNDEFINED, branch=None,
                layer="operationalize",
                layers_exercised=["eligibility", "operationalize"],
                detail={"constructs": cs}, **base)
        violated = {}
        for rule in crit.decision["thresholds"]:
            val = cs[rule["construct"]]
            op, bound = rule["op"], rule["value"]
            ok = (val <= bound if op == "<=" else
                  val >= bound if op == ">=" else val == bound)
            if not ok:
                violated[rule["construct"]] = val
        return JudgeResult(
            verdict=PASS if not violated else FAIL,
            branch=None, layer="threshold",
            layers_exercised=["eligibility", "operationalize",
                              "threshold"],
            detail={"constructs": cs, "violated": violated}, **base)

    arms = [k for k in evidence if k != "instrument"]
    if len(arms) != 2:
        return JudgeResult(verdict=UNDEFINED, branch=None,
                           layer="operationalize",
                           layers_exercised=["eligibility",
                                             "operationalize"],
                           detail={"arms": arms}, **base)
    a_key, b_key = sorted(arms)
    ca = _constructs(evidence[a_key], crit)
    cb = _constructs(evidence[b_key], crit)

    branch, detail = _decide(ca, cb, crit)
    if branch == UNDEFINED:
        return JudgeResult(verdict=UNDEFINED, branch=None,
                           layer="operationalize",
                           layers_exercised=["eligibility",
                                             "operationalize"],
                           detail=detail, **base)

    expect = crit.decision.get("expect")
    if expect:
        verdict = PASS if branch == expect else FAIL
    else:
        verdict = PASS if branch in (A_WINS, B_WINS) else FAIL
    result = JudgeResult(verdict=verdict, branch=branch,
                         layer="decision",
                         layers_exercised=["eligibility",
                                           "operationalize",
                                           "partition", "margin"],
                         detail=detail, **base)

    # 5층: 감사 - 다른 종류의 계산(예측이 아닌 실행)의 훅.
    if audit_fn is not None:
        audit_branch = audit_fn(evidence)
        result.audit = {"branch": audit_branch,
                        "agree": audit_branch == branch}
        result.layers_exercised.append("audit")
    return result
