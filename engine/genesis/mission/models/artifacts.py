"""Blackboard artifacts: proposals, critiques, simulation results, votes."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from genesis.mission.models.gamespec import GameSpec

IssueKind = Literal[
    "CONTRADICTION",
    "NON_TERMINATION",
    "DOMINANT_STRATEGY",
    "NO_SKILL",
    "DURATION",
    "CLONE",
]


class Issue(BaseModel):
    kind: IssueKind
    detail: str
    severity: float  # 0..1


class Proposal(BaseModel):
    proposal_id: str
    spec: GameSpec
    author_id: str
    parent_id: str | None = None
    addressed_critique_ids: list[str] = Field(default_factory=list)
    round_created: int


class Critique(BaseModel):
    critique_id: str
    target_proposal_id: str
    author_id: str
    issues: list[Issue] = Field(default_factory=list)
    round_created: int


class SimulationResult(BaseModel):
    result_id: str
    proposal_id: str
    author_id: str
    n_playouts: int
    playout_seed: int
    metrics: dict[str, float] = Field(default_factory=dict)
    round_created: int


class Endorsement(BaseModel):
    author_id: str
    proposal_id: str
    stance: Literal["SUPPORT", "OPPOSE"]
    round_created: int
