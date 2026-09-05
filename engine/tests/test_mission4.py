"""Experiment 4: exact minimum certificates, budget overrides, C telemetry."""

from __future__ import annotations

from genesis.mission2.config import Mission2Config
from genesis.mission2.exp3 import critical_ids, run_central, tier_instance
from genesis.mission2.exp4 import min_certificate, run_c_instrumented
from genesis.mission2.solver import survivors

CFG = Mission2Config()


def test_min_certificate_is_valid_and_contains_criticals():
    for seed in (1, 2, 3):
        inst = tier_instance(seed, CFG, "medium")
        size, ids = min_certificate(inst, CFG)
        clue_map = {c.clue_id: c for c in inst.clues}
        subset = [clue_map[i] for i in ids]
        assert len(subset) == size
        assert len(survivors(subset, CFG)) == 1
        crits = critical_ids(inst, CFG)
        assert crits <= set(ids)
        assert size >= len(crits)


def test_budget_override_is_respected():
    inst = tier_instance(4, CFG, "medium")
    r = run_central(inst, CFG, "medium", "E", budget=3)
    assert r.share_budget == 3 and r.shares_used <= 3


def test_instrumented_c_is_deterministic_and_no_return_implies_failure():
    inst = tier_instance(5, CFG, "medium")
    crits = critical_ids(inst, CFG)
    a = run_c_instrumented(inst, CFG, budget=5, crit_ids=crits)
    b = run_c_instrumented(inst, CFG, budget=5, crit_ids=crits)
    assert a.model_dump() == b.model_dump()
    if a.no_return_at > 0:
        assert not a.solved  # the bound is conservative: certain failure


def test_more_slack_never_hurts_c_on_average():
    lo, hi = [], []
    for seed in (1, 2, 3, 4, 5):
        inst = tier_instance(seed, CFG, "medium")
        crits = critical_ids(inst, CFG)
        size, _ = min_certificate(inst, CFG)
        lo.append(
            run_c_instrumented(inst, CFG, max(1, size), crits).expected_accuracy
        )
        hi.append(
            run_c_instrumented(inst, CFG, 4 * size, crits).expected_accuracy
        )
    assert sum(hi) >= sum(lo)
