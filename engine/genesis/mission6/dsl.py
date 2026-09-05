"""The protocol rule language (docs/mission6-design.md section 2).

Agents may only express protocols in this closed language. The validator
is the safety boundary: anything outside the whitelists is rejected.
Neither the descending-threshold combination nor any I2 rule appears
here — only the raw vocabulary.
"""

from __future__ import annotations

import random
from typing import Literal

from pydantic import BaseModel, Field

METRICS: dict[str, tuple[float, ...]] = {
    # metric -> allowed threshold grid for generated conditions
    "remaining_budget_ratio": (0.1, 0.25, 0.5, 0.75, 0.9),
    "estimated_slack": (0.8, 1.0, 1.2, 1.5, 2.0, 3.0),
    "public_candidate_count": (2, 5, 10, 25, 60, 150, 300),
    "my_best_gain": (0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9),
    "recent_share_gain": (0.05, 0.1, 0.2, 0.3, 0.5),
    "consecutive_low_gain": (1, 2, 3),
    "number_of_passes": (1, 2, 3, 4),
    "round_index": (2, 4, 6, 10, 15),
    "my_threshold": (0.1, 0.3, 0.5, 0.7),
}

ACTIONS = ("SHARE_BEST", "PASS", "RAISE_THRESHOLD", "LOWER_THRESHOLD")

MAX_CONDITIONS = 2
MAX_RULES = 8


class Condition(BaseModel):
    metric: str
    op: Literal["<", ">="]
    value: float


class Rule(BaseModel):
    rule_id: str
    conditions: list[Condition] = Field(default_factory=list)  # AND; empty=ALWAYS
    action: str
    priority: int = 0
    author_id: str = ""
    created_gen: int = 0


class Protocol(BaseModel):
    version: int = 0
    parent_version: int | None = None
    rules: list[Rule] = Field(default_factory=list)
    init_threshold: float = 0.0
    adopted_gen: int = 0

    def complexity(self) -> int:
        return len(self.rules) + sum(len(r.conditions) for r in self.rules)


def ancestor_protocol() -> Protocol:
    """The founding protocol: identical behavior to free cooperation C."""
    return Protocol(
        version=0,
        rules=[Rule(rule_id="r0", conditions=[], action="SHARE_BEST",
                    priority=0, author_id="founder", created_gen=0)],
    )


def validate_rule(rule: Rule) -> list[str]:
    errors = []
    if rule.action not in ACTIONS:
        errors.append(f"forbidden action: {rule.action}")
    if len(rule.conditions) > MAX_CONDITIONS:
        errors.append("too many conditions")
    for c in rule.conditions:
        if c.metric not in METRICS:
            errors.append(f"forbidden metric: {c.metric}")
    return errors


def validate_protocol(protocol: Protocol) -> list[str]:
    errors = []
    if len(protocol.rules) > MAX_RULES:
        errors.append("too many rules")
    if not (0.0 <= protocol.init_threshold <= 0.95):
        errors.append("init_threshold out of range")
    for rule in protocol.rules:
        errors.extend(validate_rule(rule))
    return errors


# ------------------------------------------------- random generation/mutation


def random_condition(rng: random.Random) -> Condition:
    metric = rng.choice(sorted(METRICS))
    return Condition(
        metric=metric,
        op=rng.choice(("<", ">=")),
        value=float(rng.choice(METRICS[metric])),
    )


def random_rule(rng: random.Random, rule_id: str, author: str, gen: int) -> Rule:
    return Rule(
        rule_id=rule_id,
        conditions=[random_condition(rng) for _ in range(rng.randint(0, 2))],
        action=rng.choice(ACTIONS),
        priority=rng.randint(0, 9),
        author_id=author,
        created_gen=gen,
    )


def propose(
    protocol: Protocol,
    rng: random.Random,
    author: str,
    gen: int,
    rule_seq: int,
) -> tuple[Protocol, str]:
    """One random rule operation. The failure summary is deliberately NOT
    an input in the deterministic pilot — performance acts only through
    the selection step (design section 2)."""
    ops = ["add", "mutate", "remove", "init_threshold"]
    candidate = protocol.model_copy(deep=True)
    for _ in range(10):
        op = rng.choice(ops)
        if op == "add" and len(candidate.rules) < MAX_RULES:
            candidate.rules.append(
                random_rule(rng, f"g{gen}-{author}-{rule_seq}", author, gen)
            )
            return candidate, "add"
        if op == "mutate" and candidate.rules:
            rule = candidate.rules[rng.randrange(len(candidate.rules))]
            kind = rng.choice(("value", "op", "action", "priority", "cond"))
            if kind == "value" and rule.conditions:
                c = rule.conditions[rng.randrange(len(rule.conditions))]
                c.value = float(rng.choice(METRICS[c.metric]))
            elif kind == "op" and rule.conditions:
                c = rule.conditions[rng.randrange(len(rule.conditions))]
                c.op = "<" if c.op == ">=" else ">="
            elif kind == "action":
                rule.action = rng.choice(ACTIONS)
            elif kind == "priority":
                rule.priority = rng.randint(0, 9)
            else:
                if len(rule.conditions) < MAX_CONDITIONS:
                    rule.conditions.append(random_condition(rng))
                elif rule.conditions:
                    rule.conditions.pop(rng.randrange(len(rule.conditions)))
            return candidate, "mutate"
        if op == "remove" and len(candidate.rules) > 1:
            candidate.rules.pop(rng.randrange(len(candidate.rules)))
            return candidate, "remove"
        if op == "init_threshold":
            candidate.init_threshold = round(
                min(0.95, max(0.0, candidate.init_threshold
                              + rng.choice((-0.2, -0.1, 0.1, 0.2)))), 2
            )
            return candidate, "init_threshold"
    return candidate, "noop"
