"""죽음 실험 (genesis.mortality)의 기계 부품 검증.

The experiment's claims rest on: per-individual memory that actually
dies, an inheritance filter that keeps only verified experience, a
death trigger identical to episode failure, and a judge that applies
the registered tie rule (ties count as satisfying every criterion).
"""

from genesis.mortality import (
    Individual, MemoryStore, inherit, judge, make_config, run_arm)
from tests.helpers import make_experience


def _exp(err: float):
    e = make_experience()
    return e.model_copy(update={"prediction_error": err})


def test_memory_store_roundtrip():
    store = MemoryStore()
    store.initialize()
    store.save(make_experience())
    assert store.count() == 1
    assert len(list(store.iter_all())) == 1
    store.close()


def test_individual_memory_dies_with_it():
    config = make_config(80)
    a = Individual(config)
    a.store.save(make_experience())
    a.close()
    b = Individual(config)          # a fresh individual, blank memory
    assert b.store.count() == 0
    assert b.inherited == 0
    b.close()


def test_inheritance_filter_keeps_only_verified():
    exps = [_exp(0.0), _exp(0.05), _exp(0.3), _exp(0.9)]
    kept = inherit(exps, eps=0.05)
    assert [e.prediction_error for e in kept] == [0.0, 0.05]  # 동률 포함


def test_individual_rehydrates_from_legacy():
    config = make_config(80)
    legacy = [_exp(0.0), _exp(0.01)]
    ind = Individual(config, legacy=legacy)
    assert ind.inherited == 2
    assert len(ind.experiences()) == 2      # legacy + own(0)
    ind.store.save(make_experience())
    assert len(ind.experiences()) == 3
    ind.close()


def test_run_arm_death_equals_failure_count():
    r = run_arm("B", master_seed=0, episodes=3, energy=25, eps=0.1)
    fails = sum(1 for e in r["episodes"] if not e["success"])
    assert r["deaths"] == fails
    assert len(r["episodes"]) == 3


def test_run_arm_immortal_never_dies():
    r = run_arm("A", master_seed=0, episodes=3, energy=25, eps=0.1)
    assert r["deaths"] == 0


def test_judge_applies_registered_tie_rule():
    def fake(arm, ms, succ, err):
        return {"arm": arm, "master_seed": ms, "deaths": 0,
                "episodes": [{"ep": i, "success": succ, "err": err,
                              "steps": 1, "inherited": 0}
                             for i in range(100)]}
    runs = []
    for ms in range(20):
        runs.append(fake("A", ms, True, 0.10))
        runs.append(fake("B", ms, True, 0.10))   # 전 지표 동률
        runs.append(fake("C", ms, True, 0.10))
    v = judge(runs)
    # 등록 규율: 동률 = 충족 -> 세 판정 모두 만점으로 통과해야 한다
    assert v["D1_A_ge_B_solve"]["count"] == 20
    assert v["D2_C_ge_B_solve"]["count"] == 20
    assert v["D3_C_le_A_err"]["count"] == 20
    assert v["D3_C_le_A_err"]["pass"]


def test_judge_direction_when_c_worse():
    def fake(arm, ms, err):
        return {"arm": arm, "master_seed": ms, "deaths": 0,
                "episodes": [{"ep": i, "success": True, "err": err,
                              "steps": 1, "inherited": 0}
                             for i in range(100)]}
    runs = []
    for ms in range(20):
        runs.append(fake("A", ms, 0.10))
        runs.append(fake("B", ms, 0.10))
        runs.append(fake("C", ms, 0.20))         # C가 명백히 나쁨
    v = judge(runs)
    assert v["D3_C_le_A_err"]["count"] == 0
    assert not v["D3_C_le_A_err"]["pass"]
