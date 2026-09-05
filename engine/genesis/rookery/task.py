"""Task adapter contract (proposal section 6.1) and the generic
Environment that puts any adapter onto the genesis/loop runner.

A TaskAdapter owns: instances (train / hidden-validation split), a
worker that executes one instance under a Procedure, and an automatic
scorer. The loop never sees task internals — only Observations and
Evaluations, same as the mission worlds.
"""

from __future__ import annotations

import statistics
from typing import Any, Protocol as TypingProtocol

from pydantic import BaseModel, Field

from genesis.loop.interfaces import Evaluation, Observation
from genesis.rookery.procedure import Procedure


class TaskResult(BaseModel):
    instance_id: str
    success: bool
    score: float                       # 0..1, automatic
    cost_units: float = 0.0            # steps taken / tokens / seconds
    events: list[dict[str, Any]] = Field(default_factory=list)


class TaskAdapterP(TypingProtocol):
    def train_instances(self) -> list[Any]: ...
    def validation_instances(self) -> list[Any]: ...
    def run(self, procedure: Procedure, instance: Any) -> TaskResult: ...


LAMBDA_COST = 0.02
LAMBDA_FAIL = 0.20
LAMBDA_COMPLEXITY = 0.005


def procedure_score(mean_score: float, mean_cost: float,
                    failure_rate: float, complexity: float) -> float:
    """Same shape as the mission-6 lambdas: quality minus cost minus
    hard failures minus bloat."""
    return (mean_score - LAMBDA_COST * mean_cost
            - LAMBDA_FAIL * failure_rate
            - LAMBDA_COMPLEXITY * complexity)


class TaskEnvironment:
    """Generic loop Environment over any TaskAdapter."""

    def __init__(self, adapter: TaskAdapterP):
        self.adapter = adapter

    def _run_set(self, procedure: Procedure,
                 instances: list[Any]) -> list[TaskResult]:
        return [self.adapter.run(procedure, inst) for inst in instances]

    def observe(self, artifact: Procedure) -> Observation:
        results = self._run_set(artifact, self.adapter.train_instances())
        return Observation(
            metrics={
                "mean_score": statistics.fmean(r.score for r in results),
                "failure_rate": statistics.fmean(
                    0.0 if r.success else 1.0 for r in results),
                "mean_cost": statistics.fmean(
                    r.cost_units for r in results),
            },
            events=[
                {"instance": r.instance_id, "score": round(r.score, 3),
                 "cost": r.cost_units, "events": r.events}
                for r in results if not r.success
            ],
        )

    def evaluate(self, artifact: Procedure) -> Evaluation:
        results = self._run_set(artifact,
                                self.adapter.validation_instances())
        mean_score = statistics.fmean(r.score for r in results)
        failure = statistics.fmean(
            0.0 if r.success else 1.0 for r in results)
        cost = statistics.fmean(r.cost_units for r in results)
        return Evaluation(
            score=procedure_score(mean_score, cost, failure,
                                  artifact.complexity()),
            metrics={"mean_score": mean_score, "failure_rate": failure,
                     "mean_cost": cost},
        )
