"""Component contracts for the self-improvement loop.

Everything is duck-typed via `typing.Protocol` so mission code and
future Rookery adapters can implement them without inheriting.
Artifacts (the thing being improved) are opaque to the loop: the
runner never inspects them, only passes them between components.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, Field


class Observation(BaseModel):
    """One structured observation of the incumbent doing work.

    `metrics` are aggregates; `events` are anonymized per-run records
    (mission 7's trajectories, Rookery's per-task logs). Free-text
    interpretation does not belong here — leakage control happens at
    prompt-rendering, but keeping the schema numeric keeps the door
    narrow by construction.
    """

    metrics: dict[str, float] = Field(default_factory=dict)
    events: list[dict[str, Any]] = Field(default_factory=list)


class Evaluation(BaseModel):
    """A validator's blind judgment of one candidate."""

    score: float
    metrics: dict[str, float] = Field(default_factory=dict)


class CandidateProposal(BaseModel):
    proposer: str
    op: str
    artifact: Any            # the candidate protocol/prompt/procedure
    meta: dict[str, Any] = Field(default_factory=dict)


class Decision(BaseModel):
    adopted_index: int | None    # None = keep incumbent (rollback)
    reason: str = ""


@runtime_checkable
class EnvironmentP(Protocol):
    """Where the incumbent works and where candidates are verified."""

    def observe(self, artifact: Any) -> Observation:
        """Run the incumbent on training work, return observations."""
        ...

    def evaluate(self, artifact: Any) -> Evaluation:
        """Blind-evaluate a candidate on the validation set."""
        ...


@runtime_checkable
class ProposerP(Protocol):
    def propose(self, incumbent: Any, observation: Observation,
                history: list[dict[str, Any]], seq: int,
                gen: int) -> CandidateProposal:
        ...


@runtime_checkable
class SelectorP(Protocol):
    def decide(self, incumbent_eval: Evaluation,
               candidate_evals: list[Evaluation]) -> Decision:
        ...
