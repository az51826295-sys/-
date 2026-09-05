"""Procedure proposers: the random baseline (fair, same-budget) now;
the LLM proposer follows once the domain's leakage rules are
pre-registered (which observations may be shown, which step names are
interpretation-free, etc.)."""

from __future__ import annotations

import random
from typing import Any

from genesis.loop.interfaces import CandidateProposal, Observation
from genesis.rookery.procedure import MAX_STEPS, Procedure, ProcedureSpace


class RandomProcedureProposer:
    def __init__(self, space: ProcedureSpace, master_seed: int = 0):
        self.space = space
        self.master_seed = master_seed

    def propose(self, incumbent: Procedure, observation: Observation,
                history: list[dict[str, Any]], seq: int,
                gen: int) -> CandidateProposal:
        rng = random.Random(
            f"rookery:R:{self.master_seed}:gen{gen}:prop{seq}")
        candidate = incumbent.model_copy(deep=True)
        ops = ["add_step", "remove_step", "swap_steps", "set_knob"]
        for _ in range(10):
            op = rng.choice(ops)
            if op == "add_step" and len(candidate.steps) < MAX_STEPS:
                pos = rng.randint(0, len(candidate.steps))
                candidate.steps.insert(
                    pos, rng.choice(self.space.step_vocabulary))
                break
            if op == "remove_step" and candidate.steps:
                candidate.steps.pop(rng.randrange(len(candidate.steps)))
                break
            if op == "swap_steps" and len(candidate.steps) >= 2:
                i, j = rng.sample(range(len(candidate.steps)), 2)
                candidate.steps[i], candidate.steps[j] = (
                    candidate.steps[j], candidate.steps[i])
                break
            if op == "set_knob" and self.space.knob_ranges:
                knob = rng.choice(sorted(self.space.knob_ranges))
                candidate.knobs[knob] = rng.choice(
                    self.space.knob_ranges[knob])
                break
        else:
            op = "noop"
        assert self.space.validate_procedure(candidate) == []
        return CandidateProposal(proposer=f"agent{seq}", op=op,
                                 artifact=candidate)
