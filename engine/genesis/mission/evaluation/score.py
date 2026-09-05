"""Objective score (fixed, pre-registered) and trait-weighted subjective score.

The objective score is the only thing experiment verdicts may use; the
subjective score exists solely inside agent decisions and votes (design 6).
"""

from __future__ import annotations

from genesis.mission.config import MissionConfig
from genesis.mission.grammar.space import Fingerprint, fingerprint, fingerprint_distance
from genesis.mission.models.artifacts import Issue
from genesis.mission.models.gamespec import GameSpec
from genesis.mission.models.traits import AgentTraits


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def term_scores(
    spec: GameSpec, metrics: dict[str, float], config: MissionConfig
) -> dict[str, float]:
    return {
        "skill": clamp01((metrics["skill_margin"] - 0.55) / 0.35),
        "balance": 1.0 - 2.0 * abs(metrics["first_player_adv"] - 0.5),
        "choice": clamp01((metrics["branching_mean"] - 2.0) / 6.0),
        "close": clamp01(metrics["close_decision_rate"]),
        "suspense": 0.5 * clamp01(metrics["lead_changes"] / 4.0)
        + 0.5 * clamp01(metrics["decided_late"]),
        "comeback": clamp01(metrics["comeback_rate"] / 0.3),
        "variety": clamp01(metrics["action_entropy"]),
        "duration": 1.0 - clamp01(abs(metrics["est_minutes"] - 10.0) / 10.0),
        "simplicity": 1.0 - clamp01((spec.rule_count() - 3) / 5.0),
        "low_draw": 1.0 - clamp01(metrics["draw_rate"] / 0.3),
    }


def _weights(config: MissionConfig) -> dict[str, float]:
    return {
        "skill": config.w_skill,
        "balance": config.w_balance,
        "choice": config.w_choice,
        "close": config.w_close,
        "suspense": config.w_suspense,
        "comeback": config.w_comeback,
        "variety": config.w_variety,
        "duration": config.w_duration,
        "simplicity": config.w_simplicity,
        "low_draw": config.w_low_draw,
    }


def gated_out(
    metrics: dict[str, float], issues: list[Issue], config: MissionConfig
) -> bool:
    if any(i.kind in ("CONTRADICTION", "CLONE") for i in issues):
        return True
    return metrics["termination_rate"] < config.min_termination_rate


def objective(
    spec: GameSpec,
    metrics: dict[str, float],
    issues: list[Issue],
    config: MissionConfig,
) -> float:
    if gated_out(metrics, issues, config):
        return 0.0
    terms = term_scores(spec, metrics, config)
    weights = _weights(config)
    return sum(weights[k] * terms[k] for k in weights)


def subjective(
    traits: AgentTraits,
    spec: GameSpec,
    metrics: dict[str, float] | None,
    static: list[Issue],
    visible_fps: list[Fingerprint],
    config: MissionConfig,
) -> float:
    """What this agent believes the proposal is worth, given what it can see.

    Without a published SimulationResult only static information exists —
    this information asymmetry is what makes sharing sim results valuable.
    """
    fp = fingerprint(spec)
    others = [f for f in visible_fps if f != fp]
    novelty = min((fingerprint_distance(fp, f) for f in others), default=0.5)
    simplicity = 1.0 - clamp01((spec.rule_count() - 3) / 5.0)

    if metrics is not None:
        terms = term_scores(spec, metrics, config)
        weights = dict(_weights(config))
        weights["simplicity"] *= 0.5 + 1.5 * traits.simplicity_preference
        total_w = sum(weights.values())
        base = sum(weights[k] * terms[k] for k in weights) / total_w
        if gated_out(metrics, static, config):
            base = 0.0
    else:
        # prior: optimists (high risk_tolerance) assume more; issues hurt
        base = 0.35 + 0.15 * traits.risk_tolerance - 0.1 * len(static)
        base += 0.1 * traits.simplicity_preference * simplicity

    return clamp01(base + 0.3 * traits.novelty_preference * novelty)
