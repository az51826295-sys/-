"""M0: the rule space is valid, clone-free, and deterministic."""

from __future__ import annotations

import random

from genesis.mission.config import MissionConfig
from genesis.mission.grammar.clones import is_clone
from genesis.mission.grammar.space import (
    check_constraints,
    fingerprint,
    fingerprint_distance,
    mutate,
    sample,
)
from genesis.mission.models import (
    ActionKind,
    AgentTraits,
    BoardSpec,
    Critique,
    EndKind,
    GameSpec,
    Issue,
    ScoringKind,
    ScoringRule,
    TurnAction,
    WinKind,
    sample_traits,
)


def mid_traits() -> AgentTraits:
    return AgentTraits(
        novelty_preference=0.5,
        risk_tolerance=0.5,
        criticism_tendency=0.5,
        simplicity_preference=0.5,
    )


def tictactoe() -> GameSpec:
    return GameSpec(
        spec_id="ttt",
        name="tic-tac-toe",
        board=BoardSpec(width=3, height=3),
        tokens_per_player=5,
        actions=[TurnAction(kind=ActionKind.PLACE)],
        scoring=[ScoringRule(kind=ScoringKind.LINE, params={"length": 3, "points": 1})],
        win=WinKind.SCORE_REACH,
        win_params={"k": 1},
        end=EndKind.BOARD_FULL,
    )


def test_thousand_samples_are_valid_and_clone_free():
    traits = mid_traits()
    existing = []
    for i in range(1000):
        rng = random.Random(i)
        spec = sample(rng, traits, existing, f"s{i}")
        assert check_constraints(spec) == [], (i, check_constraints(spec))
        assert is_clone(spec) is None
        if i % 50 == 0:
            existing.append(fingerprint(spec))


def test_sampling_is_deterministic():
    traits = mid_traits()
    a = sample(random.Random(42), traits, [], "x")
    b = sample(random.Random(42), traits, [], "x")
    assert a.model_dump() == b.model_dump()


def test_trait_sampling_is_deterministic_and_bounded():
    config = MissionConfig()
    t1 = sample_traits(random.Random(7), config)
    t2 = sample_traits(random.Random(7), config)
    assert t1 == t2
    for v in (t1.novelty_preference, t1.risk_tolerance, t1.criticism_tendency,
              t1.simplicity_preference):
        assert config.trait_min <= v <= config.trait_max


def test_clone_detection_catches_tictactoe():
    assert is_clone(tictactoe()) is not None
    # a 4x4 variant with line 4 is not a clone
    variant = tictactoe()
    variant.board = BoardSpec(width=4, height=4)
    variant.scoring[0].params["length"] = 4
    assert is_clone(variant) is None


def test_mutation_is_deterministic_and_never_returns_clone():
    traits = mid_traits()
    spec = sample(random.Random(1), traits, [], "s")
    a = mutate(spec, random.Random(9), "m")
    b = mutate(spec, random.Random(9), "m")
    assert a.model_dump() == b.model_dump()
    for i in range(200):
        m = mutate(spec, random.Random(i), f"m{i}")
        assert is_clone(m) is None
        assert m.spec_id == f"m{i}"


def test_mutation_can_break_a_game():
    """Mutations must be able to produce constraint violations —
    otherwise CRITIQUE has nothing real to catch (decision 19)."""
    traits = mid_traits()
    broke = 0
    for i in range(300):
        spec = sample(random.Random(i), traits, [], "s")
        m = mutate(spec, random.Random(i * 7 + 1), "m")
        if check_constraints(m):
            broke += 1
    assert broke > 0


def test_repair_critique_fixes_contradiction():
    spec = GameSpec(
        spec_id="broken",
        name="broken",
        board=BoardSpec(width=4, height=4),
        tokens_per_player=6,
        actions=[TurnAction(kind=ActionKind.PLACE)],
        scoring=[ScoringRule(kind=ScoringKind.CAPTURED, params={"points": 2})],
        win=WinKind.MOST_AT_END,
        end=EndKind.ROUNDS,
        end_params={"r": 10},
    )
    assert check_constraints(spec)
    critique = Critique(
        critique_id="c1",
        target_proposal_id="p",
        author_id="a",
        issues=[Issue(kind="CONTRADICTION", detail="x", severity=0.9)],
        round_created=1,
    )
    fixed = mutate(spec, random.Random(3), "fixed", critique)
    assert len(check_constraints(fixed)) < len(check_constraints(spec))


def test_fingerprint_distance_properties():
    traits = mid_traits()
    a = sample(random.Random(11), traits, [], "a")
    assert fingerprint_distance(fingerprint(a), fingerprint(a)) == 0.0
    b = sample(random.Random(12), traits, [], "b")
    d = fingerprint_distance(fingerprint(a), fingerprint(b))
    assert 0.0 <= d <= 1.0
