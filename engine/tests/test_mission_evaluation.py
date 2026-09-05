"""M2: score ordering and monotonicity."""

from __future__ import annotations

from genesis.mission.config import MissionConfig
from genesis.mission.engine.playout import evaluate_spec
from genesis.mission.engine.static_check import static_issues
from genesis.mission.evaluation.score import objective, subjective, term_scores
from genesis.mission.models import AgentTraits

from test_mission_engine import (
    contradictory_game,
    never_ending_game,
    surround_game,
)


def traits(**kw) -> AgentTraits:
    base = dict(
        novelty_preference=0.5,
        risk_tolerance=0.5,
        criticism_tendency=0.5,
        simplicity_preference=0.5,
    )
    base.update(kw)
    return AgentTraits(**base)


def test_good_game_beats_degenerates():
    config = MissionConfig()
    good = surround_game()
    good_score = objective(
        good, evaluate_spec(good, config, 1), static_issues(good), config
    )
    assert good_score > 0.3

    forever = never_ending_game()
    forever_score = objective(
        forever, evaluate_spec(forever, config, 1), static_issues(forever), config
    )
    assert forever_score == 0.0  # termination gate

    broken = contradictory_game()
    broken_score = objective(
        broken, evaluate_spec(broken, config, 1), static_issues(broken), config
    )
    assert broken_score == 0.0  # contradiction gate


def test_term_monotonicity():
    config = MissionConfig()
    spec = surround_game()
    base = {
        "termination_rate": 1.0, "mean_turns": 30.0, "est_minutes": 7.5,
        "draw_rate": 0.1, "branching_mean": 5.0, "skill_margin": 0.7,
        "first_player_adv": 0.5, "action_entropy": 0.8,
        "close_decision_rate": 0.3, "lead_changes": 2.0,
        "decided_late": 0.5, "comeback_rate": 0.1,
    }
    t0 = term_scores(spec, base, config)
    better_skill = dict(base, skill_margin=0.9)
    assert term_scores(spec, better_skill, config)["skill"] > t0["skill"]
    worse_balance = dict(base, first_player_adv=0.8)
    assert term_scores(spec, worse_balance, config)["balance"] < t0["balance"]
    more_suspense = dict(base, lead_changes=4.0, decided_late=0.9)
    assert term_scores(spec, more_suspense, config)["suspense"] > t0["suspense"]
    closer = dict(base, close_decision_rate=0.6)
    assert term_scores(spec, closer, config)["close"] > t0["close"]


def test_subjective_information_asymmetry():
    """Without a sim result the agent can only use priors + static info."""
    config = MissionConfig()
    spec = surround_game()
    metrics = evaluate_spec(spec, config, 1)
    t = traits()
    with_sim = subjective(t, spec, metrics, [], [], config)
    without_sim = subjective(t, spec, None, [], [], config)
    assert with_sim != without_sim

    # static issues lower the no-sim prior
    broken = contradictory_game()
    assert subjective(
        t, broken, None, static_issues(broken), [], config
    ) < subjective(t, spec, None, [], config=config, visible_fps=[])


def test_simplicity_preference_changes_subjective_not_objective():
    config = MissionConfig()
    spec = surround_game()  # 5 rules -> simplicity term is low
    metrics = evaluate_spec(spec, config, 1)
    plain = subjective(traits(simplicity_preference=0.05), spec, metrics, [], [], config)
    simple_lover = subjective(
        traits(simplicity_preference=0.95), spec, metrics, [], [], config
    )
    assert plain != simple_lover
