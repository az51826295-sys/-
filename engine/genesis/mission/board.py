"""The shared workbench. Arm C has one; arm B has one per agent.

Snapshot rule: an artifact created in round r becomes visible in round
r+1 (agents inside a round act on the same view — design 3).
"""

from __future__ import annotations

from genesis.mission.models import (
    BoardEvent,
    Critique,
    Endorsement,
    Proposal,
    SimulationResult,
)


class Blackboard:
    def __init__(self) -> None:
        self.proposals: dict[str, Proposal] = {}
        self.critiques: dict[str, Critique] = {}
        self.sims: dict[str, SimulationResult] = {}
        self.endorsements: list[Endorsement] = []
        self.events: list[BoardEvent] = []

    # ---- posting ----

    def post_proposal(self, p: Proposal) -> None:
        self.proposals[p.proposal_id] = p

    def post_critique(self, c: Critique) -> None:
        self.critiques[c.critique_id] = c

    def post_sim(self, s: SimulationResult) -> None:
        self.sims[s.result_id] = s

    def post_endorsement(self, e: Endorsement) -> None:
        self.endorsements.append(e)

    def log(self, event: BoardEvent) -> None:
        self.events.append(event)

    # ---- visibility-filtered queries (rnd = the round of the reader) ----

    def visible_proposals(self, rnd: int) -> list[Proposal]:
        return sorted(
            (p for p in self.proposals.values() if p.round_created < rnd),
            key=lambda p: p.proposal_id,
        )

    def critiques_for(self, proposal_id: str, rnd: int) -> list[Critique]:
        return sorted(
            (
                c
                for c in self.critiques.values()
                if c.target_proposal_id == proposal_id and c.round_created < rnd
            ),
            key=lambda c: c.critique_id,
        )

    def sim_for(self, proposal_id: str, rnd: int) -> SimulationResult | None:
        matches = sorted(
            (
                s
                for s in self.sims.values()
                if s.proposal_id == proposal_id and s.round_created < rnd
            ),
            key=lambda s: s.result_id,
        )
        return matches[-1] if matches else None

    def addressed_critique_ids(self, rnd: int) -> set[str]:
        out: set[str] = set()
        for p in self.proposals.values():
            if p.round_created < rnd:
                out.update(p.addressed_critique_ids)
        return out
