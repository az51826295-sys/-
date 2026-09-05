"""The 7B rule language (docs/mission7b-design.md section 1).

Additions over 7A, each gated by a feature flag so ablations can turn
them off independently:
  modes  — per-agent integer mode 0..3, SET_MODE/CLEAR_MODE actions,
           `my_mode` and `rounds_since_my_action` metrics
  roles  — optional rule tag role 0..2; agents get role = index mod 3
  chains — THEN may carry up to 2 actions, executed in order
  social — public metrics: total_shares, consecutive_all_pass,
           mean_recent_gain, active_speaker_count

Neither the descending-threshold combination nor any known-good 7A/7B
protocol appears here — only vocabulary. The ancestor is unchanged:
ALWAYS -> SHARE_BEST.
"""

from __future__ import annotations

import random
from typing import Literal

from pydantic import BaseModel, Field

MAX_CONDITIONS = 2
MAX_RULES = 8
MAX_CHAIN = 2
N_MODES = 4          # modes 0..3
N_ROLES = 3          # roles 0..2

LOCAL_METRICS: dict[str, tuple[float, ...]] = {
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

MODE_METRICS: dict[str, tuple[float, ...]] = {
    "my_mode": (1, 2, 3),
    "rounds_since_my_action": (1, 2, 3, 5),
}

SOCIAL_METRICS: dict[str, tuple[float, ...]] = {
    "total_shares": (2, 4, 6, 10),
    "consecutive_all_pass": (1, 2, 3),
    "mean_recent_gain": (0.05, 0.1, 0.2, 0.3, 0.5),
    "active_speaker_count": (1, 2, 3, 4),
}

BASE_ACTIONS = ("SHARE_BEST", "PASS", "RAISE_THRESHOLD",
                "LOWER_THRESHOLD")
MODE_ACTIONS = ("SET_MODE", "CLEAR_MODE")


class Features(BaseModel):
    """Which 7B extensions are active (ablation flags)."""

    modes: bool = True
    roles: bool = True
    chains: bool = True
    social: bool = True

    def metrics(self) -> dict[str, tuple[float, ...]]:
        out = dict(LOCAL_METRICS)
        if self.modes:
            out.update(MODE_METRICS)
        if self.social:
            out.update(SOCIAL_METRICS)
        return out

    def actions(self) -> tuple[str, ...]:
        return BASE_ACTIONS + (MODE_ACTIONS if self.modes else ())

    def max_chain(self) -> int:
        return MAX_CHAIN if self.chains else 1


class Condition(BaseModel):
    metric: str
    op: Literal["<", ">="]
    value: float


class Action(BaseModel):
    name: str
    mode: int | None = None       # SET_MODE argument


class Rule7B(BaseModel):
    rule_id: str
    conditions: list[Condition] = Field(default_factory=list)
    actions: list[Action] = Field(default_factory=list)
    role: int | None = None       # None = applies to every agent
    priority: int = 0
    author_id: str = ""
    created_gen: int = 0


class Protocol7B(BaseModel):
    version: int = 0
    parent_version: int | None = None
    rules: list[Rule7B] = Field(default_factory=list)
    init_threshold: float = 0.0
    adopted_gen: int = 0

    def complexity(self) -> int:
        return (len(self.rules)
                + sum(len(r.conditions) for r in self.rules)
                + sum(max(0, len(r.actions) - 1) for r in self.rules)
                + sum(1 for r in self.rules if r.role is not None))


def ancestor_protocol7b() -> Protocol7B:
    return Protocol7B(version=0, rules=[
        Rule7B(rule_id="r0", actions=[Action(name="SHARE_BEST")],
               priority=0, author_id="founder"),
    ])


# ------------------------------------------------------------- validation


def validate_rule(rule: Rule7B, features: Features) -> list[str]:
    errors = []
    metrics = features.metrics()
    actions = features.actions()
    if not rule.actions:
        errors.append("rule has no actions")
    if len(rule.actions) > features.max_chain():
        errors.append("action chain too long")
    for a in rule.actions:
        if a.name not in actions:
            errors.append(f"forbidden action: {a.name}")
        if a.name == "SET_MODE":
            if a.mode is None or not (0 <= a.mode < N_MODES):
                errors.append("SET_MODE needs mode 0..3")
        elif a.mode is not None:
            errors.append(f"{a.name} takes no mode argument")
    if len(rule.conditions) > MAX_CONDITIONS:
        errors.append("too many conditions")
    for c in rule.conditions:
        if c.metric not in metrics:
            errors.append(f"forbidden metric: {c.metric}")
    if rule.role is not None:
        if not features.roles:
            errors.append("roles feature disabled")
        elif not (0 <= rule.role < N_ROLES):
            errors.append("role out of range")
    return errors


def validate_protocol(protocol: Protocol7B,
                      features: Features) -> list[str]:
    errors = []
    if len(protocol.rules) > MAX_RULES:
        errors.append("too many rules")
    if not (0.0 <= protocol.init_threshold <= 0.95):
        errors.append("init_threshold out of range")
    for rule in protocol.rules:
        errors.extend(validate_rule(rule, features))
    return errors


# ------------------------------------------- random generation / mutation


def random_condition(rng: random.Random, features: Features) -> Condition:
    metrics = features.metrics()
    metric = rng.choice(sorted(metrics))
    return Condition(metric=metric, op=rng.choice(("<", ">=")),
                     value=float(rng.choice(metrics[metric])))


def random_action(rng: random.Random, features: Features) -> Action:
    name = rng.choice(features.actions())
    return Action(name=name,
                  mode=rng.randrange(N_MODES) if name == "SET_MODE"
                  else None)


def random_rule(rng: random.Random, features: Features, rule_id: str,
                author: str, gen: int) -> Rule7B:
    n_actions = rng.randint(1, features.max_chain())
    role = None
    if features.roles and rng.random() < 0.3:
        role = rng.randrange(N_ROLES)
    return Rule7B(
        rule_id=rule_id,
        conditions=[random_condition(rng, features)
                    for _ in range(rng.randint(0, MAX_CONDITIONS))],
        actions=[random_action(rng, features) for _ in range(n_actions)],
        role=role,
        priority=rng.randint(0, 9),
        author_id=author,
        created_gen=gen,
    )


def propose_random(
    protocol: Protocol7B,
    rng: random.Random,
    features: Features,
    author: str,
    gen: int,
    rule_seq: int,
) -> tuple[Protocol7B, str]:
    """R baseline: one random rule operation over the FULL extended
    space (same operation mix as 7A: add/mutate/remove/init_threshold)."""
    ops = ["add", "mutate", "remove", "init_threshold"]
    candidate = protocol.model_copy(deep=True)
    for _ in range(10):
        op = rng.choice(ops)
        if op == "add" and len(candidate.rules) < MAX_RULES:
            candidate.rules.append(random_rule(
                rng, features, f"g{gen}-{author}-{rule_seq}", author, gen))
            return candidate, "add"
        if op == "mutate" and candidate.rules:
            rule = candidate.rules[rng.randrange(len(candidate.rules))]
            kind = rng.choice(("value", "op", "action", "priority",
                               "cond", "role"))
            if kind == "value" and rule.conditions:
                c = rule.conditions[rng.randrange(len(rule.conditions))]
                c.value = float(rng.choice(features.metrics()[c.metric]))
            elif kind == "op" and rule.conditions:
                c = rule.conditions[rng.randrange(len(rule.conditions))]
                c.op = "<" if c.op == ">=" else ">="
            elif kind == "action":
                rule.actions[rng.randrange(len(rule.actions))] = (
                    random_action(rng, features))
            elif kind == "priority":
                rule.priority = rng.randint(0, 9)
            elif kind == "role" and features.roles:
                rule.role = rng.choice(
                    [None] + list(range(N_ROLES)))
            else:
                if len(rule.conditions) < MAX_CONDITIONS:
                    rule.conditions.append(
                        random_condition(rng, features))
                elif rule.conditions:
                    rule.conditions.pop(
                        rng.randrange(len(rule.conditions)))
            return candidate, "mutate"
        if op == "remove" and len(candidate.rules) > 1:
            candidate.rules.pop(rng.randrange(len(candidate.rules)))
            return candidate, "remove"
        if op == "init_threshold":
            candidate.init_threshold = round(
                min(0.95, max(0.0, candidate.init_threshold
                              + rng.choice((-0.2, -0.1, 0.1, 0.2)))), 2)
            return candidate, "init_threshold"
    return candidate, "noop"


# ------------------------------------------------------------ space size


def rule_space_size(features: Features) -> int:
    """Count of syntactically distinct single rules (design section 1:
    the registered evidence that random search cannot cover 7B)."""
    metrics = features.metrics()
    n_cond1 = sum(2 * len(vals) for vals in metrics.values())
    conds = 1 + n_cond1 + n_cond1 * n_cond1        # 0, 1, or 2 (ordered)
    n_act1 = len(BASE_ACTIONS) + (N_MODES + 1 if features.modes else 0)
    acts = n_act1 if not features.chains else n_act1 + n_act1 * n_act1
    roles = 1 + (N_ROLES if features.roles else 0)
    priorities = 10
    return conds * acts * roles * priorities
