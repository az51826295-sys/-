"""Generic generation loop with resume (proposal section 7).

One generation:
  observe incumbent -> N proposals -> blind-evaluate all -> selector
  decides -> registry records (and persists) -> next generation.

The runner holds no experiment logic: budgets, scoring, and leakage
control live in the environment/proposer/selector implementations.
Resume: if the registry already holds k completed generations, the
runner continues from k+1 with the registered incumbent.
"""

from __future__ import annotations

from typing import Any, Callable

from genesis.loop.interfaces import (
    CandidateProposal,
    Decision,
    EnvironmentP,
    Evaluation,
    ProposerP,
    SelectorP,
)
from genesis.loop.registry import GenerationEntry, Registry


class BlindSelector:
    """Mission-6 M semantics: adopt the best candidate iff it strictly
    beats the incumbent; otherwise keep the incumbent (rollback)."""

    def decide(self, incumbent_eval: Evaluation,
               candidate_evals: list[Evaluation]) -> Decision:
        if not candidate_evals:
            return Decision(adopted_index=None, reason="no candidates")
        best = max(range(len(candidate_evals)),
                   key=lambda i: candidate_evals[i].score)
        if candidate_evals[best].score > incumbent_eval.score:
            return Decision(adopted_index=best,
                            reason=f"{candidate_evals[best].score:.4f} > "
                                   f"{incumbent_eval.score:.4f}")
        return Decision(adopted_index=None, reason="no candidate beat "
                                                   "the incumbent")


class Runner:
    def __init__(
        self,
        environment: EnvironmentP,
        proposer: ProposerP,
        selector: SelectorP,
        registry: Registry,
        artifact_load: Callable[[Any], Any],
        artifact_dump: Callable[[Any], Any],
        proposals_per_gen: int,
        log: Callable[[str], None] | None = None,
    ):
        self.env = environment
        self.proposer = proposer
        self.selector = selector
        self.registry = registry
        self.load = artifact_load
        self.dump = artifact_dump
        self.n = proposals_per_gen
        self._log = log or (lambda s: None)

    def run(self, founding: Any, generations: int) -> None:
        self.registry.register_founding(self.dump(founding))
        start = self.registry.completed_generations()
        incumbent = self.load(self.registry.incumbent_dump())
        incumbent_eval: Evaluation | None = None
        if self.registry.state.incumbent_score is not None and start > 0:
            incumbent_eval = Evaluation(
                score=self.registry.state.incumbent_score)

        for gen in range(start + 1, generations + 1):
            observation = self.env.observe(incumbent)
            if incumbent_eval is None:
                incumbent_eval = self.env.evaluate(incumbent)
            history = self.registry.history_for_proposer()

            proposals: list[CandidateProposal] = [
                self.proposer.propose(incumbent, observation, history,
                                      seq, gen)
                for seq in range(self.n)
            ]
            evals = [self.env.evaluate(p.artifact) for p in proposals]
            decision = self.selector.decide(incumbent_eval, evals)

            adopted_dump = None
            if decision.adopted_index is not None:
                incumbent = proposals[decision.adopted_index].artifact
                incumbent_eval = evals[decision.adopted_index]
                adopted_dump = self.dump(incumbent)

            entry = GenerationEntry(
                gen=gen,
                incumbent_version_before=(
                    self.registry.state.incumbent_version),
                incumbent_version_after=-1,   # filled by the registry
                incumbent_score=incumbent_eval.score,
                rolled_back=decision.adopted_index is None,
                observation_metrics=observation.metrics,
                # full candidate artifacts are persisted: the 7A plateau
                # autopsy was only possible because rejected candidates
                # were kept
                candidates=[
                    {"proposer": p.proposer, "op": p.op,
                     "score": e.score,
                     "adopted": i == decision.adopted_index,
                     "artifact": self.dump(p.artifact),
                     "meta": p.meta}
                    for i, (p, e) in enumerate(zip(proposals, evals))
                ],
            )
            version = self.registry.register_generation(entry, adopted_dump)
            self._log(f"gen {gen}: v{version} "
                      f"score={incumbent_eval.score:.4f} "
                      f"{'(rollback)' if decision.adopted_index is None else ''}")
