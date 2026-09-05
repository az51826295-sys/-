"""Protocol version and lineage records (design section 3, step 7).

Every candidate ever proposed is kept — proposer, operation, scores,
whether it was adopted — so the full genealogy of a discovered protocol
can be audited and the ablations (section 6) can replay any version.
"""

from __future__ import annotations

import json

from pydantic import BaseModel, Field

from genesis.mission6.dsl import Protocol


class EvalStats(BaseModel):
    """Blind evaluation of one candidate on a fixed instance set."""

    mean_accuracy: float = 0.0
    unsolved_rate: float = 1.0
    comm_ratio: float = 0.0          # mean shares_used / budget
    complexity: float = 0.0
    score: float = 0.0
    weak_share_rate: float = 0.0
    pass_rate: float = 0.0
    forced_share_rate: float = 0.0   # runs with >=1 forced share
    fidelity: float = 0.0
    rule_fires: dict[str, int] = Field(default_factory=dict)


class CandidateRecord(BaseModel):
    proposer: str
    op: str                          # add | mutate | remove | init_threshold | noop
    slot: int | None = None          # J only: which agent's policy this replaces
    protocol: Protocol
    stats: EvalStats | None = None   # full-validation blind eval (M/L/J; K telemetry)
    votes: int = 0                   # K only
    adopted: bool = False


class GenerationRecord(BaseModel):
    gen: int
    incumbent_version_before: int
    incumbent_version_after: int
    incumbent_score: float = 0.0     # score of the incumbent on validation
    rolled_back: bool = False        # no candidate beat the incumbent
    train: EvalStats | None = None   # telemetry from the training instances
    candidates: list[CandidateRecord] = Field(default_factory=list)


class Lineage(BaseModel):
    group: str
    master_seed: int = 0
    generations: list[GenerationRecord] = Field(default_factory=list)
    # version -> snapshot of every protocol that was ever the incumbent
    protocols: dict[str, Protocol] = Field(default_factory=dict)
    # J: final per-agent set is stored as versions "slot:<i>" instead
    final_per_agent: list[Protocol] | None = None

    def record_incumbent(self, protocol: Protocol) -> None:
        self.protocols[str(protocol.version)] = protocol.model_copy(deep=True)

    def final_protocol(self) -> Protocol:
        last = self.generations[-1]
        return self.protocols[str(last.incumbent_version_after)]


def save_lineage(path: str, lineage: Lineage) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(lineage.model_dump(), f, ensure_ascii=False, indent=1)


def load_lineage(path: str) -> Lineage:
    with open(path, encoding="utf-8") as f:
        return Lineage.model_validate(json.load(f))


def audit(lineage: Lineage) -> list[str]:
    """Mechanical invariants the pilot must satisfy (design section 8.7).

    Returns a list of violations; empty means the machinery is sound.
    """
    from genesis.mission6.dsl import validate_protocol

    problems: list[str] = []
    prev_version = 0
    prev_score: float | None = None
    for g in lineage.generations:
        if g.incumbent_version_before != prev_version:
            problems.append(
                f"gen {g.gen}: version chain broken "
                f"({prev_version} -> before={g.incumbent_version_before})"
            )
        after = str(g.incumbent_version_after)
        if after not in lineage.protocols:
            problems.append(f"gen {g.gen}: incumbent v{after} not snapshotted")
        else:
            errors = validate_protocol(lineage.protocols[after])
            if errors:
                problems.append(f"gen {g.gen}: invalid incumbent: {errors}")
            parent = lineage.protocols[after].parent_version
            if (g.incumbent_version_after != g.incumbent_version_before
                    and parent != g.incumbent_version_before):
                problems.append(
                    f"gen {g.gen}: adopted v{after} has parent {parent}, "
                    f"expected {g.incumbent_version_before}"
                )
        adopted = [c for c in g.candidates if c.adopted]
        if g.rolled_back and adopted:
            problems.append(f"gen {g.gen}: rollback but candidate adopted")
        if lineage.group in ("M", "L"):
            if prev_score is not None and g.incumbent_score < prev_score - 1e-9:
                problems.append(
                    f"gen {g.gen}: M/L incumbent score fell "
                    f"{prev_score:.4f} -> {g.incumbent_score:.4f}"
                )
            prev_score = g.incumbent_score
        prev_version = g.incumbent_version_after
    return problems
