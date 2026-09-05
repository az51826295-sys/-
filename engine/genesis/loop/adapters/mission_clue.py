"""Adapter: the distributed-clue world as a generic Environment, and
the mission-6/7 proposers behind the generic ProposerP contract.

Uses only public functions of the frozen mission modules — no logic is
duplicated, so the adapter cannot drift from the originals.
"""

from __future__ import annotations

from typing import Any

from genesis.mission2.config import Mission2Config
from genesis.mission6.dsl import Protocol
from genesis.mission6.evolution import (
    ProposalContext,
    Proposer as M6Proposer,
    build_pairs,
    evaluate,
    evaluate_results,
    random_proposer,
)
from genesis.loop.interfaces import CandidateProposal, Evaluation, Observation


class ClueEnvironment:
    def __init__(
        self,
        config: Mission2Config,
        train_seeds: list[int],
        valid_seeds: list[int],
        slacks: tuple[float, ...],
    ):
        self.config = config
        self.train_pairs = build_pairs(train_seeds, slacks, config,
                                       cycle=True)
        self.valid_pairs = build_pairs(valid_seeds, slacks, config,
                                       cycle=False)
        # kept for proposers that want raw traces (tier T)
        self.last_train_results = []

    def observe(self, artifact: Protocol) -> Observation:
        results = evaluate_results(self.train_pairs, self.config,
                                   protocol=artifact)
        self.last_train_results = results
        stats = evaluate(self.train_pairs, self.config, protocol=artifact,
                         results=results)
        return Observation(
            metrics={
                "mean_accuracy": stats.mean_accuracy,
                "unsolved_rate": stats.unsolved_rate,
                "comm_ratio": stats.comm_ratio,
                "weak_share_rate": stats.weak_share_rate,
                "pass_rate": stats.pass_rate,
                "forced_share_rate": stats.forced_share_rate,
            },
            events=[
                {"seed": r.seed, "solved": r.solved,
                 "budget": r.share_budget, "shares": r.shares_used,
                 "trace": [e.model_dump() for e in r.trace]}
                for r in results if not r.solved
            ],
        )

    def evaluate(self, artifact: Protocol) -> Evaluation:
        stats = evaluate(self.valid_pairs, self.config, protocol=artifact)
        return Evaluation(score=stats.score, metrics={
            "mean_accuracy": stats.mean_accuracy,
            "unsolved_rate": stats.unsolved_rate,
        })


class MissionProposerAdapter:
    """Wraps a mission-6/7 `Proposer` callable. The wrapped proposer
    keeps its own rng keys / prompts, so trajectories are identical to
    the frozen runs given the same group/master_seed."""

    def __init__(self, inner: M6Proposer, env: ClueEnvironment,
                 group: str = "M", master_seed: int = 0):
        self.inner = inner
        self.env = env
        self.group = group
        self.master_seed = master_seed

    def propose(self, incumbent: Protocol, observation: Observation,
                history: list[dict[str, Any]], seq: int,
                gen: int) -> CandidateProposal:
        stats = evaluate(self.env.train_pairs, self.env.config,
                         protocol=incumbent,
                         results=self.env.last_train_results or None)
        context = ProposalContext(
            group=self.group, master_seed=self.master_seed, gen=gen,
            incumbent=incumbent, train_stats=stats,
            train_results=self.env.last_train_results,
            prev_rolled_back=(history[-1]["rolled_back"]
                              if history else None),
        )
        candidate, op = self.inner(context, seq)
        return CandidateProposal(
            proposer=f"agent{seq}", op=op, artifact=candidate)


def default_random_adapter(env: ClueEnvironment,
                           master_seed: int = 0) -> MissionProposerAdapter:
    return MissionProposerAdapter(random_proposer, env,
                                  master_seed=master_seed)
