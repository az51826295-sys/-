"""Experiment 3: tiers, distortions, decap, voting, learned priorities."""

from __future__ import annotations

import statistics

from genesis.mission2.clues import generate_instance
from genesis.mission2.config import Mission2Config
from genesis.mission2.exp3 import (
    TIERS,
    critical_ids,
    run_central,
    run_decap,
    run_free,
    run_learned,
    run_voting,
    tier_instance,
    train_learned,
)
from genesis.mission2.solver import survivors

CFG = Mission2Config()


def test_tier_instances_are_valid_and_use_palette():
    for tier, kinds in TIERS.items():
        inst = tier_instance(1, CFG, tier)
        assert len(survivors(inst.clues, CFG)) == 1
        assert all(c.kind in kinds for c in inst.clues), tier


def test_hard_tier_has_low_marginal_clues():
    """Hard clues individually prune little (combination-dependence)."""
    easy = tier_instance(2, CFG, "easy")
    hard = tier_instance(2, CFG, "hard")

    def mean_single_reduction(inst):
        return statistics.fmean(
            625 - len(survivors([c], CFG)) for c in inst.clues
        )

    assert mean_single_reduction(hard) < mean_single_reduction(easy)


def test_e_variant_solves_easy_and_medium():
    for tier in ("easy", "medium"):
        inst = tier_instance(3, CFG, tier)
        r = run_central(inst, CFG, tier, "E")
        assert r.solved, tier


def test_noisy_reports_degrade_on_average():
    exact, noisy = [], []
    for seed in range(1, 7):
        inst = tier_instance(seed, CFG, "medium")
        exact.append(run_central(inst, CFG, "medium", "E").expected_accuracy)
        noisy.append(
            run_central(inst, CFG, "medium", "F", sigma=1.0).expected_accuracy
        )
    assert statistics.fmean(noisy) <= statistics.fmean(exact)


def test_variants_are_deterministic_and_respect_budget():
    inst = tier_instance(4, CFG, "medium")
    for runner in (
        lambda: run_central(inst, CFG, "medium", "F", sigma=0.5),
        lambda: run_central(inst, CFG, "medium", "G"),
        lambda: run_voting(inst, CFG, "medium"),
        lambda: run_decap(inst, CFG, "medium"),
        lambda: run_free(inst, CFG, "medium"),
    ):
        a, b = runner(), runner()
        assert a.model_dump() == b.model_dump()
        assert a.shares_used <= a.share_budget


def test_solved_board_contains_all_critical_clues():
    inst = tier_instance(5, CFG, "medium")
    r = run_central(inst, CFG, "medium", "E")
    if r.solved:
        assert r.criticals_missed == 0


def test_learned_scores_change_behavior_and_training_runs():
    scores, curve = train_learned(CFG, "easy", episodes=6)
    assert len(curve) == 6
    assert scores  # learned something
    inst = tier_instance(6, CFG, "easy")
    trained, _ = run_learned(inst, CFG, "easy", scores)
    untrained, _ = run_learned(inst, CFG, "easy", {})
    assert trained.share_budget == untrained.share_budget


def test_report_error_recorded_for_distorted_variants():
    inst = tier_instance(7, CFG, "medium")
    g = run_central(inst, CFG, "medium", "G")
    assert g.report_error_mean > 0.0
    e = run_central(inst, CFG, "medium", "E")
    assert e.report_error_mean == 0.0
