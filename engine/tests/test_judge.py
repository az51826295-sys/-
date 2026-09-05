"""심판자 골든 5종 + 계약 검사. 통과 못 하면 배포하지 않는다."""

import json
import os

from genesis.judge import (
    ESCAPE_REGISTRY, check_partition, judge, load_criterion,
    register_escape)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRIT = os.path.join(ROOT, "criteria", "example-ab.yaml")
FIX = os.path.join(os.path.dirname(__file__), "fixtures", "judge")

INST_OK = {"stale_rate": 0.0, "unknown_rate": 0.9,
           "unresolved_rate": 0.0}


def arm(calls, succ, n=20, comp=1.0):
    return {"calls_total": calls, "successes": succ, "n_runs": n,
            "completion_rate": comp}


def scenarios():
    return {
        "G1": {"A": arm(400, 20), "B": arm(800, 20),
               "instrument": INST_OK},
        "G2": {"A": arm(600, 20), "B": arm(600, 20),
               "instrument": INST_OK},
        "G3": {"A": arm(800, 20), "B": arm(400, 20),
               "instrument": INST_OK},
        "G4": {"A": arm(640, 0), "B": arm(640, 0),
               "instrument": INST_OK},
        "G5": {"A": arm(400, 20, comp=0.4), "B": arm(800, 20),
               "instrument": INST_OK},
    }


def test_golden_five():
    crit = load_criterion(CRIT)
    with open(os.path.join(FIX, "expected.json"),
              encoding="utf-8") as f:
        expected = json.load(f)
    for name, ev in scenarios().items():
        c = crit
        if name == "G3":
            # 역방향 시나리오는 expect가 등록된 기준으로 판정
            import dataclasses
            c = dataclasses.replace(
                crit, decision={**crit.decision, "expect": "A_wins"})
        got = judge(ev, c)
        want = expected[name]
        assert got.verdict == want["verdict"], name
        assert got.branch == want["branch"], name
        assert got.layer == want["layer"], name


def test_deterministic():
    crit = load_criterion(CRIT)
    ev = scenarios()["G1"]
    r1, r2 = judge(ev, crit), judge(ev, crit)
    assert r1.record() == r2.record()


def test_partition_exhaustive_and_exclusive():
    check_partition(load_criterion(CRIT))


def test_record_carries_criterion_identity():
    crit = load_criterion(CRIT)
    rec = judge(scenarios()["G1"], crit).record()
    assert rec["criterion_id"] == "example-ab"
    assert rec["version"] == 1
    assert len(rec["hash"]) == 12
    assert rec["escaped"] is False


def test_escape_is_recorded():
    @register_escape("always-pass")
    def _fn(evidence):
        return "통과", {"why": "표현 불가 기준의 예시"}
    import dataclasses
    crit = dataclasses.replace(load_criterion(CRIT),
                               escape_fn="always-pass")
    got = judge(scenarios()["G1"], crit)
    assert got.escaped is True and got.layer == "escape"
    assert got.record()["escaped"] is True
    ESCAPE_REGISTRY.pop("always-pass", None)


def test_instrument_state_gates_before_scoring():
    crit = load_criterion(CRIT)
    ev = scenarios()["G1"]
    ev = {**ev, "instrument": {**INST_OK, "stale_rate": 0.5}}
    got = judge(ev, crit)
    assert got.verdict == "미정의" and got.layer == "eligibility"


# ------------------- 문턱 판정 모드 (소크 기준, 손 계산 골든 3종)

SOAK_CRIT = os.path.join(ROOT, "criteria", "soak7d.yaml")


def soak_subject(**over):
    base = {"duration_h": 168.0, "hours_planned": 168,
            "interventions": 0, "budget_overruns": 0,
            "isolation_halts": 0, "audit_halts": 0,
            "succeeded": 91, "n_runs": 1, "completion_rate": 1.0}
    base.update(over)
    return {"subject": base, "instrument": INST_OK}


def test_soak_threshold_pass():
    """완주 + 전 조건 0 위반 -> 통과. margin 층은 안 돌았음이
    기록돼야 한다 (행사된 층 명시 - 2026-08-15 확정 1번)."""
    got = judge(soak_subject(), load_criterion(SOAK_CRIT))
    assert got.verdict == "통과" and got.layer == "threshold"
    assert "margin" not in got.layers_exercised
    assert got.record()["layers_exercised"] == [
        "eligibility", "operationalize", "threshold"]


def test_soak_threshold_fail_on_one_intervention():
    got = judge(soak_subject(interventions=1),
                load_criterion(SOAK_CRIT))
    assert got.verdict == "미통과"
    assert got.detail["violated"] == {"interventions": 1}


def test_soak_incomplete_is_undefined_not_fail():
    """미완주(중단)는 미통과가 아니라 미정의 - 원인 분류 트랙으로
    간다 (soak-cause-classification.md)."""
    got = judge(soak_subject(duration_h=100.0,
                             completion_rate=100.0 / 168),
                load_criterion(SOAK_CRIT))
    assert got.verdict == "미정의" and got.layer == "eligibility"
