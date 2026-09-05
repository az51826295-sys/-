"""The clue world with the 7B executor, as a generic loop Environment.

Scoring reuses the frozen mission-6 lambdas (protocol_score) so 7A and
7B scores are directly comparable.
"""

from __future__ import annotations

import statistics

from genesis.loop.interfaces import Evaluation, Observation
from genesis.mission2.config import Mission2Config
from genesis.mission6.evolution import build_pairs, protocol_score
from genesis.mission6.executor import ExecResult
from genesis.mission6.lineage import EvalStats
from genesis.mission7b.dsl7b import Protocol7B
from genesis.mission7b.executor7b import run_protocol7b


def evaluate7b(pairs, config: Mission2Config,
               protocol: Protocol7B,
               results: list[ExecResult] | None = None) -> EvalStats:
    if results is None:
        results = [
            run_protocol7b(inst, config, budget, protocol).model_copy(
                update={"slack": slack})
            for inst, budget, slack in pairs
        ]
    mean_acc = statistics.fmean(r.expected_accuracy for r in results)
    comm = statistics.fmean(r.shares_used / r.share_budget for r in results)
    unsolved = statistics.fmean(0.0 if r.solved else 1.0 for r in results)
    fires: dict[str, int] = {}
    for r in results:
        for rid, count in r.rule_fires.items():
            fires[rid] = fires.get(rid, 0) + count
    complexity = float(protocol.complexity())
    return EvalStats(
        mean_accuracy=mean_acc,
        unsolved_rate=unsolved,
        comm_ratio=comm,
        complexity=complexity,
        score=protocol_score(mean_acc, comm, unsolved, complexity),
        weak_share_rate=statistics.fmean(r.weak_share_rate for r in results),
        pass_rate=statistics.fmean(r.pass_rate for r in results),
        forced_share_rate=statistics.fmean(
            1.0 if r.forced_shares else 0.0 for r in results),
        fidelity=statistics.fmean(r.fidelity for r in results),
        rule_fires=fires,
    )


class Clue7BEnvironment:
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
        self.last_train_results: list[ExecResult] = []

    def observe(self, artifact: Protocol7B) -> Observation:
        results = [
            run_protocol7b(inst, self.config, budget, artifact).model_copy(
                update={"slack": slack})
            for inst, budget, slack in self.train_pairs
        ]
        self.last_train_results = results
        stats = evaluate7b(self.train_pairs, self.config, artifact,
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
                 "final_candidates": (int(1 / r.expected_accuracy)
                                      if r.expected_accuracy > 0 else -1),
                 "trace": [e.model_dump() for e in r.trace]}
                for r in results if not r.solved
            ],
        )

    def evaluate(self, artifact: Protocol7B) -> Evaluation:
        stats = evaluate7b(self.valid_pairs, self.config, artifact)
        return Evaluation(score=stats.score, metrics={
            "mean_accuracy": stats.mean_accuracy,
            "unsolved_rate": stats.unsolved_rate,
            "comm_ratio": stats.comm_ratio,
        })
