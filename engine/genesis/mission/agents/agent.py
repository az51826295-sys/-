"""One mission agent: utilities -> softmax -> execute (design 7).

All agents share this code; only traits and rng differ. No fixed roles.
"""

from __future__ import annotations

import math
import random

from genesis.mission.board import Blackboard
from genesis.mission.config import MissionConfig
from genesis.mission.engine.playout import evaluate_spec
from genesis.mission.engine.static_check import dynamic_issues, static_issues
from genesis.mission.evaluation.score import subjective
from genesis.mission.grammar.space import fingerprint, mutate, sample
from genesis.mission.models import (
    AgentTraits,
    BoardEvent,
    Critique,
    Endorsement,
    Proposal,
    SimulationResult,
)


class MissionAgent:
    def __init__(
        self,
        agent_id: str,
        traits: AgentTraits,
        rng: random.Random,
        config: MissionConfig,
        run_tag: str,
    ):
        self.agent_id = agent_id
        self.traits = traits
        self.rng = rng
        self.config = config
        self.run_tag = run_tag
        self.active = True
        self._seq = 0

    def _new_id(self, prefix: str) -> str:
        self._seq += 1
        return f"{prefix}-{self.agent_id}-{self._seq:03d}"

    # ------------------------------------------------------------- valuation

    def _subjective(self, board: Blackboard, proposal: Proposal, rnd: int) -> float:
        sim = board.sim_for(proposal.proposal_id, rnd)
        metrics = sim.metrics if sim else None
        visible_fps = [
            fingerprint(p.spec)
            for p in board.visible_proposals(rnd)
            if p.proposal_id != proposal.proposal_id
        ]
        return subjective(
            self.traits,
            proposal.spec,
            metrics,
            static_issues(proposal.spec),
            visible_fps,
            self.config,
        )

    # --------------------------------------------------------------- acting

    def act(self, board: Blackboard, rnd: int) -> None:
        proposals = board.visible_proposals(rnd)
        subj = {p.proposal_id: self._subjective(board, p, rnd) for p in proposals}
        own = sum(1 for p in proposals if p.author_id == self.agent_id)

        uncritiqued = [
            p for p in proposals if not board.critiques_for(p.proposal_id, rnd)
        ]
        unsimulated = [p for p in proposals if not board.sim_for(p.proposal_id, rnd)]

        addressed = board.addressed_critique_ids(rnd)
        modify_pairs: list[tuple[Proposal, Critique, float]] = []
        for p in proposals:
            for c in board.critiques_for(p.proposal_id, rnd):
                if c.critique_id in addressed or not c.issues:
                    continue
                sev = max(i.severity for i in c.issues)
                modify_pairs.append((p, c, sev * (0.3 + subj[p.proposal_id])))

        t = self.traits
        cfg = self.config
        utilities = {
            "PROPOSE": cfg.w_propose
            * (0.5 + t.novelty_preference)
            * (1.0 / (1.0 + own))
            * (2.0 if not proposals else 1.0),
            "MODIFY": (
                cfg.w_modify * max(g for _, _, g in modify_pairs)
                if modify_pairs
                else (
                    0.25 * cfg.w_modify * max(subj.values()) if proposals else 0.0
                )
            ),
            "CRITIQUE": (
                cfg.w_critique
                * (0.5 + t.criticism_tendency)
                * max(subj[p.proposal_id] for p in uncritiqued)
                if uncritiqued
                else 0.0
            ),
            "SIMULATE": (
                cfg.w_simulate
                * (0.5 + (1.0 - t.risk_tolerance))
                * max(subj[p.proposal_id] for p in unsimulated)
                if unsimulated
                else 0.0
            ),
        }

        choice = self._softmax_pick(utilities)
        if choice == "PROPOSE":
            self._do_propose(board, rnd, proposals, utilities)
        elif choice == "MODIFY":
            self._do_modify(board, rnd, modify_pairs, proposals, subj, utilities)
        elif choice == "CRITIQUE":
            self._do_critique(board, rnd, uncritiqued, subj, utilities)
        else:
            self._do_simulate(board, rnd, unsimulated, subj, utilities)

    def _softmax_pick(self, utilities: dict[str, float]) -> str:
        keys = [k for k, u in utilities.items() if u > 0.0]
        if not keys:
            return "PROPOSE"
        temp = self.config.softmax_temp
        weights = [math.exp(utilities[k] / temp) for k in keys]
        total = sum(weights)
        r = self.rng.random() * total
        acc = 0.0
        for k, w in zip(keys, weights):
            acc += w
            if r <= acc:
                return k
        return keys[-1]

    # ----------------------------------------------------------- executions

    def _do_propose(self, board, rnd, proposals, utilities) -> None:
        existing = [fingerprint(p.spec) for p in proposals]
        spec = sample(self.rng, self.traits, existing, self._new_id("spec"))
        proposal = Proposal(
            proposal_id=self._new_id("prop"),
            spec=spec,
            author_id=self.agent_id,
            round_created=rnd,
        )
        board.post_proposal(proposal)
        board.log(
            BoardEvent(
                round=rnd,
                agent_id=self.agent_id,
                kind="PROPOSE",
                artifact_id=proposal.proposal_id,
                utilities=utilities,
            )
        )

    def _do_modify(self, board, rnd, pairs, proposals, subj, utilities) -> None:
        if pairs:
            parent, critique, _ = max(pairs, key=lambda x: x[2])
            spec = mutate(parent.spec, self.rng, self._new_id("spec"), critique)
            addressed = [critique.critique_id]
            refs = [parent.proposal_id, critique.critique_id]
        else:
            parent = max(proposals, key=lambda p: subj[p.proposal_id])
            critique = None
            spec = mutate(parent.spec, self.rng, self._new_id("spec"))
            addressed = []
            refs = [parent.proposal_id]
        proposal = Proposal(
            proposal_id=self._new_id("prop"),
            spec=spec,
            author_id=self.agent_id,
            parent_id=parent.proposal_id,
            addressed_critique_ids=addressed,
            round_created=rnd,
        )
        board.post_proposal(proposal)
        board.log(
            BoardEvent(
                round=rnd,
                agent_id=self.agent_id,
                kind="MODIFY",
                artifact_id=proposal.proposal_id,
                refs=refs,
                utilities=utilities,
            )
        )

    def _do_critique(self, board, rnd, uncritiqued, subj, utilities) -> None:
        target = max(uncritiqued, key=lambda p: subj[p.proposal_id])
        issues = static_issues(target.spec)
        refs = [target.proposal_id]
        sim = board.sim_for(target.proposal_id, rnd)
        if sim:
            issues += dynamic_issues(sim.metrics, self.config)
            refs.append(sim.result_id)
        critique = Critique(
            critique_id=self._new_id("crit"),
            target_proposal_id=target.proposal_id,
            author_id=self.agent_id,
            issues=issues,
            round_created=rnd,
        )
        board.post_critique(critique)
        board.log(
            BoardEvent(
                round=rnd,
                agent_id=self.agent_id,
                kind="CRITIQUE",
                artifact_id=critique.critique_id,
                refs=refs,
                utilities=utilities,
            )
        )

    def _do_simulate(self, board, rnd, unsimulated, subj, utilities) -> None:
        target = max(unsimulated, key=lambda p: subj[p.proposal_id])
        seed = f"{self.run_tag}:{target.proposal_id}"
        metrics = evaluate_spec(target.spec, self.config, seed)
        sim = SimulationResult(
            result_id=self._new_id("sim"),
            proposal_id=target.proposal_id,
            author_id=self.agent_id,
            n_playouts=self.config.playouts_gvr + self.config.playouts_gvg,
            playout_seed=0,
            metrics=metrics,
            round_created=rnd,
        )
        board.post_sim(sim)
        board.log(
            BoardEvent(
                round=rnd,
                agent_id=self.agent_id,
                kind="SIMULATE",
                artifact_id=sim.result_id,
                refs=[target.proposal_id],
                utilities=utilities,
            )
        )

    # ------------------------------------------------------------ selection

    def vote(self, board: Blackboard, rnd: int) -> None:
        proposals = board.visible_proposals(rnd)
        if len(proposals) < 2:
            return
        subj = {p.proposal_id: self._subjective(board, p, rnd) for p in proposals}
        best = max(proposals, key=lambda p: subj[p.proposal_id])
        worst = min(proposals, key=lambda p: subj[p.proposal_id])
        board.post_endorsement(
            Endorsement(
                author_id=self.agent_id,
                proposal_id=best.proposal_id,
                stance="SUPPORT",
                round_created=rnd,
            )
        )
        board.log(
            BoardEvent(
                round=rnd,
                agent_id=self.agent_id,
                kind="ENDORSE",
                artifact_id=best.proposal_id,
            )
        )
        if worst.proposal_id != best.proposal_id:
            board.post_endorsement(
                Endorsement(
                    author_id=self.agent_id,
                    proposal_id=worst.proposal_id,
                    stance="OPPOSE",
                    round_created=rnd,
                )
            )
            board.log(
                BoardEvent(
                    round=rnd,
                    agent_id=self.agent_id,
                    kind="OPPOSE",
                    artifact_id=worst.proposal_id,
                )
            )
