"""Contradiction detection without execution, plus metric-based issues.

Static issues are what critics can find for free; dynamic issues require
someone to have spent budget on a SIMULATE first (design 6).
"""

from __future__ import annotations

from genesis.mission.config import MissionConfig
from genesis.mission.grammar.clones import is_clone
from genesis.mission.grammar.space import check_constraints
from genesis.mission.models.artifacts import Issue
from genesis.mission.models.gamespec import GameSpec


def static_issues(spec: GameSpec) -> list[Issue]:
    issues = [
        Issue(kind="CONTRADICTION", detail=v, severity=0.9)
        for v in check_constraints(spec)
    ]
    clone = is_clone(spec)
    if clone:
        issues.append(Issue(kind="CLONE", detail=clone, severity=1.0))
    return issues


def dynamic_issues(metrics: dict[str, float], config: MissionConfig) -> list[Issue]:
    issues: list[Issue] = []
    term = metrics["termination_rate"]
    if term < config.min_termination_rate:
        issues.append(
            Issue(
                kind="NON_TERMINATION",
                detail=f"termination_rate={term:.2f}",
                severity=min(1.0, (1.0 - term) * 2),
            )
        )
    if metrics["draw_rate"] > 0.5:
        issues.append(
            Issue(
                kind="NON_TERMINATION",
                detail=f"draw_rate={metrics['draw_rate']:.2f}",
                severity=0.6,
            )
        )
    if metrics["skill_margin"] < 0.55:
        issues.append(
            Issue(
                kind="NO_SKILL",
                detail=f"skill_margin={metrics['skill_margin']:.2f}",
                severity=0.7,
            )
        )
    if metrics["action_entropy"] < 0.35 and metrics["branching_mean"] > 2:
        issues.append(
            Issue(
                kind="DOMINANT_STRATEGY",
                detail=f"action_entropy={metrics['action_entropy']:.2f}",
                severity=0.5,
            )
        )
    gap = abs(metrics["est_minutes"] - 10.0)
    if gap > 7.0:
        issues.append(
            Issue(
                kind="DURATION",
                detail=f"est_minutes={metrics['est_minutes']:.1f}",
                severity=min(1.0, gap / 20.0),
            )
        )
    return issues
