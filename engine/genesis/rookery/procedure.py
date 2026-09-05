"""The artifact Rookery improves: a work Procedure.

A Procedure is deliberately NOT free text (proposal section 9). It is
a small set of typed knobs plus ordered step hints drawn from a closed
vocabulary — expressive enough for the loop to improve, closed enough
to validate mechanically. The vocabulary is per-task-domain; the
generic schema lives here.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

MAX_STEPS = 8
MAX_KNOBS = 12


class Procedure(BaseModel):
    version: int = 0
    parent_version: int | None = None
    # ordered step hints from the task domain's closed vocabulary
    steps: list[str] = Field(default_factory=list)
    # typed knobs (the domain declares names, types, and ranges)
    knobs: dict[str, float | int | bool | str] = Field(
        default_factory=dict)
    adopted_gen: int = 0

    def complexity(self) -> int:
        return len(self.steps) + len(self.knobs)


class ProcedureSpace(BaseModel):
    """What a domain allows. The validator is the safety boundary."""

    step_vocabulary: list[str]
    knob_ranges: dict[str, list] = Field(default_factory=dict)
    # knob -> [allowed values] (discrete, keeps random baseline fair)

    def validate_procedure(self, p: Procedure) -> list[str]:
        errors = []
        if len(p.steps) > MAX_STEPS:
            errors.append("too many steps")
        if len(p.knobs) > MAX_KNOBS:
            errors.append("too many knobs")
        for s in p.steps:
            if s not in self.step_vocabulary:
                errors.append(f"unknown step: {s}")
        for k, v in p.knobs.items():
            if k not in self.knob_ranges:
                errors.append(f"unknown knob: {k}")
            elif v not in self.knob_ranges[k]:
                errors.append(f"knob {k} value {v!r} out of range")
        return errors
