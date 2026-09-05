"""Experiment 2: generator validity, solver correctness, group behavior."""

from __future__ import annotations

from genesis.mission2.clues import Clue, generate_instance, holds
from genesis.mission2.config import Mission2Config
from genesis.mission2.groups import run_group
from genesis.mission2.solver import expected_accuracy, survivors

CFG = Mission2Config()


def test_solver_counts_on_handcrafted_clues():
    not_clue = Clue(clue_id="x", kind="NOT", params={"attr": 0, "value": 2})
    assert len(survivors([not_clue], CFG)) == 500        # 625 - 125
    one_of = Clue(clue_id="y", kind="IS_ONE_OF", params={"attr": 1, "values": [0, 3]})
    assert len(survivors([one_of], CFG)) == 250
    pair = Clue(
        clue_id="z", kind="PAIR_NOT",
        params={"attr1": 0, "value1": 1, "attr2": 1, "value2": 1},
    )
    assert len(survivors([pair], CFG)) == 600            # 625 - 25
    imp = Clue(
        clue_id="w", kind="IMPLIES",
        params={"attr1": 0, "value1": 1, "attr2": 1, "value2": 1},
    )
    assert len(survivors([imp], CFG)) == 525             # 625 - 4*25


def test_generator_guarantees_necessity():
    """V1/V2 by construction: full set unique, every subset ambiguous."""
    for seed in range(1, 11):
        inst = generate_instance(seed, CFG)
        full = survivors(inst.clues, CFG)
        assert len(full) == 1 and list(full[0]) == inst.truth
        clue_map = {c.clue_id: c for c in inst.clues}
        for ids in inst.partition:
            subset = [clue_map[i] for i in ids]
            assert len(survivors(subset, CFG)) >= CFG.min_subset_candidates
            assert all(holds(c, tuple(inst.truth)) for c in subset)


def test_generator_is_deterministic():
    a = generate_instance(3, CFG)
    b = generate_instance(3, CFG)
    assert a.model_dump() == b.model_dump()


def test_group_a_solves_and_b_cannot():
    for seed in (1, 2, 3):
        inst = generate_instance(seed, CFG)
        assert run_group("A", inst, CFG).expected_accuracy == 1.0
        assert run_group("B", inst, CFG).expected_accuracy < 0.2


def test_group_e_at_least_matches_d():
    for seed in (1, 2, 3, 4, 5):
        inst = generate_instance(seed, CFG)
        e = run_group("E", inst, CFG).expected_accuracy
        d = run_group("D", inst, CFG).expected_accuracy
        assert e >= d


def test_groups_c_d_respect_budget_and_are_deterministic():
    inst = generate_instance(5, CFG)
    for g in ("C", "D", "E"):
        r1 = run_group(g, inst, CFG)
        r2 = run_group(g, inst, CFG)
        assert r1.model_dump() == r2.model_dump()
        assert r1.shares_used <= r1.share_budget
        assert 0.0 < r1.coverage <= 1.0
        # sharing can only shrink the candidate set -> accuracy non-decreasing
        assert all(
            b >= a - 1e-12 for a, b in zip(r1.trajectory, r1.trajectory[1:])
        )


def test_c_beats_b_when_sharing_exists():
    for seed in (1, 2, 3, 4, 5):
        inst = generate_instance(seed, CFG)
        c = run_group("C", inst, CFG).expected_accuracy
        b = run_group("B", inst, CFG).expected_accuracy
        assert c > b


def test_expected_accuracy_definition():
    inst = generate_instance(7, CFG)
    assert expected_accuracy(inst.clues, CFG) == 1.0
