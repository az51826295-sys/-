"""Simulated bug-fixing domain (skeleton stage; proposal section 6.2).

Deterministic: each instance is a bug with a type and difficulty; the
worker's chance of fixing it is a fixed function of which diagnostic
steps the Procedure orders (earlier steps weigh more), which step
matches the bug type, and how many attempts the knobs allow. This is
NOT real work — it exists so the whole loop (adapter, hidden split,
blind evaluation, registry, cost accounting) runs end-to-end today.
The landscape is honest: steps help specific bug types, bloat costs,
and no single step fixes everything.
"""

from __future__ import annotations

import hashlib
import random

from genesis.rookery.procedure import Procedure, ProcedureSpace
from genesis.rookery.task import TaskResult

STEPS = (
    "run_tests_first",
    "read_error_message",
    "check_boundary_conditions",
    "compare_expected_actual",
    "trace_recursion",
    "isolate_state",
    "write_repro_case",
    "review_diff_before_done",
)

BUG_MATCH = {
    "off_by_one": "check_boundary_conditions",
    "wrong_operator": "compare_expected_actual",
    "missing_base_case": "trace_recursion",
    "state_leak": "isolate_state",
}

SPACE = ProcedureSpace(
    step_vocabulary=list(STEPS),
    knob_ranges={
        "max_attempts": [1, 2, 3],
        "hypothesis_first": [True, False],
    },
)


def default_procedure() -> Procedure:
    """The founding procedure: naive — no diagnostics, one attempt."""
    return Procedure(version=0, steps=[], knobs={"max_attempts": 1,
                                                 "hypothesis_first": False})


class Bug:
    def __init__(self, instance_id: str, bug_type: str, difficulty: float):
        self.instance_id = instance_id
        self.bug_type = bug_type
        self.difficulty = difficulty


def _corpus(seed_base: int, n: int, tag: str) -> list[Bug]:
    rng = random.Random(f"pyfix:{tag}:{seed_base}")
    types = list(BUG_MATCH)
    return [
        Bug(f"{tag}{i}", rng.choice(types),
            round(rng.uniform(0.35, 0.95), 3))
        for i in range(n)
    ]


class PyFixSimAdapter:
    def __init__(self, seed_base: int = 0, n_train: int = 20,
                 n_valid: int = 20):
        self._train = _corpus(seed_base, n_train, "train")
        self._valid = _corpus(seed_base + 1, n_valid, "valid")

    def train_instances(self) -> list[Bug]:
        return list(self._train)

    def validation_instances(self) -> list[Bug]:
        return list(self._valid)

    def run(self, procedure: Procedure, bug: Bug) -> TaskResult:
        # diagnostic power: position-weighted step credit
        localization = 0.30
        events = []
        for pos, step in enumerate(procedure.steps):
            weight = max(0.0, 1.0 - 0.2 * pos)      # order matters
            credit = 0.0
            if step in ("run_tests_first", "read_error_message",
                        "write_repro_case"):
                credit = 0.12 * weight
                localization += credit
            if step == BUG_MATCH[bug.bug_type]:
                credit = 0.30 * weight
                localization += credit
            events.append({"step": step, "credit": round(credit, 3)})

        attempts = int(procedure.knobs.get("max_attempts", 1))
        hypothesis = bool(procedure.knobs.get("hypothesis_first", False))
        # each retry adds a diminishing chance; hypothesis-first makes
        # the first attempt stronger but costs a little extra
        power = localization + (0.06 if hypothesis else 0.0)
        best = 0.0
        for k in range(attempts):
            best = max(best, power * (1.0 - 0.25 * k) + 0.10 * k)
        # deterministic threshold noise per instance
        h = int(hashlib.sha256(
            f"{bug.instance_id}:{bug.bug_type}".encode()).hexdigest(), 16)
        wobble = (h % 1000) / 1000 * 0.10 - 0.05
        success = best >= bug.difficulty + wobble
        cost = (len(procedure.steps)
                + attempts + (1 if hypothesis else 0)) / 10.0
        score = 1.0 if success else round(min(0.3, localization / 3), 3)
        return TaskResult(
            instance_id=bug.instance_id, success=success, score=score,
            cost_units=cost,
            events=events + [{"bug_type_hidden": True,
                              "attempts": attempts}],
        )
