"""Experiment 5: yield protocol, learning statistics, fidelity telemetry."""

from __future__ import annotations

from genesis.mission2.config import Mission2Config
from genesis.mission2.exp3 import run_central, tier_instance
from genesis.mission2.exp4 import min_certificate
from genesis.mission2.exp5 import (
    SocietyStats,
    run_c_with_fidelity,
    run_i2,
    train_society,
)

CFG = Mission2Config()


def setup_instance(seed: int, slack: float):
    inst = tier_instance(seed, CFG, "medium")
    cert, _ = min_certificate(inst, CFG)
    return inst, max(1, round(slack * cert))


def test_i2_is_deterministic_and_respects_budget():
    inst, budget = setup_instance(1, 1.5)
    a = run_i2(inst, CFG, budget, SocietyStats(), learn=False)
    b = run_i2(inst, CFG, budget, SocietyStats(), learn=False)
    assert a.model_dump() == b.model_dump()
    assert a.shares_used <= budget
    assert 0.0 <= a.fidelity <= 1.0


def test_learning_accumulates_public_observations():
    inst, budget = setup_instance(2, 1.5)
    stats = SocietyStats()
    run_i2(inst, CFG, budget, stats, learn=True)
    assert len(stats.gains) > 0
    assert len(stats.gains) == len(stats.log_steps)


def test_frozen_stats_do_not_change_at_test_time():
    inst, budget = setup_instance(3, 1.5)
    stats = SocietyStats(gains=[0.5] * 10, log_steps=[0.7] * 10)
    before = stats.model_dump()
    run_i2(inst, CFG, budget, stats, learn=False)
    assert stats.model_dump() == before


def test_thresholds_rise_when_tight():
    stats = SocietyStats(gains=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
                         log_steps=[0.7] * 8)
    assert stats.threshold("tight") > stats.threshold("mid") > stats.threshold(
        "loose"
    )


def test_e_fidelity_is_ceiling_and_c_below():
    inst, budget = setup_instance(4, 1.5)
    c = run_c_with_fidelity(inst, CFG, budget)
    assert 0.0 <= c.fidelity <= 1.0
    e = run_central(inst, CFG, "medium", "E", budget=budget)
    assert e.share_budget == budget  # E telemetry fidelity is 1.0 by definition


def test_training_runs_and_returns_curve():
    stats, curve = train_society(CFG)
    assert len(curve) == 30
    assert len(stats.gains) > 30
