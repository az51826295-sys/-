"""Fixed protocol executor — agents cannot modify this code.

Semantics: speaking cycles. Within a cycle, agents are visited in
shuffled order; each evaluates its protocol rules by priority (desc,
tie by rule_id) against locally computable metrics and performs the
first matching action. A SHARE_BEST ends the cycle. A full pass with
no share increments `number_of_passes`; after MAX_PASSES the executor
forces a share (safety net, logged). Default when no rule matches: PASS.

Group J runs with one protocol per agent (`per_agent`); the shared-
protocol groups pass a single `protocol`. Local bests are cached per
cycle: the board does not change between passes, so this is purely a
speed optimization with identical behavior.
"""

from __future__ import annotations

import math
import random
from collections import Counter

from pydantic import BaseModel, Field

from genesis.mission2.clues import Instance
from genesis.mission2.config import Mission2Config
from genesis.mission2.exp3 import _Run
from genesis.mission2.groups import _best_accuracy
from genesis.mission2.solver import survivors
from genesis.mission6.dsl import Protocol, Rule

MAX_PASSES = 6
PRIOR_LOG_STEP = 0.7
THRESH_STEP = 0.1


class ShareEvent(BaseModel):
    """Observational record of one committed share (mission 7 prompts)."""

    gain: float                      # 1 - after/base, at commit time
    forced: bool                     # executor safety net fired
    base: int                        # public candidates before the share
    after: int                       # public candidates after the share


class ExecResult(BaseModel):
    seed: int
    slack: float = 0.0
    expected_accuracy: float
    solved: bool
    shares_used: int
    share_budget: int
    rounds_to_unique: int = -1
    forced_shares: int = 0
    fidelity: float = 0.0            # telemetry only
    weak_share_rate: float = 0.0     # shares with gain < 0.1
    pass_rate: float = 0.0           # PASS actions / agent turns
    rule_fires: dict[str, int] = Field(default_factory=dict)
    trace: list[ShareEvent] = Field(default_factory=list)


def _matches(rule: Rule, metrics: dict[str, float]) -> bool:
    for c in rule.conditions:
        v = metrics[c.metric]
        if c.op == "<" and not v < c.value:
            return False
        if c.op == ">=" and not v >= c.value:
            return False
    return True


def _ordered(protocol: Protocol) -> list[Rule]:
    return sorted(protocol.rules, key=lambda r: (-r.priority, r.rule_id))


def run_protocol(
    instance: Instance,
    config: Mission2Config,
    budget: int,
    protocol: Protocol | None = None,
    per_agent: list[Protocol] | None = None,
    salt: int = 0,
) -> ExecResult:
    if (protocol is None) == (per_agent is None):
        raise ValueError("pass exactly one of protocol / per_agent")
    if per_agent is not None and len(per_agent) != config.n_agents:
        raise ValueError("per_agent must have one protocol per agent")
    protocols = per_agent if per_agent is not None else (
        [protocol] * config.n_agents
    )
    # rng is keyed by instance only, never by protocol identity: two
    # protocols evaluated on the same instance see the same shuffle
    # stream, so score differences are attributable to the rules alone
    # (and a protocol's score does not change when its version is bumped
    # on adoption).
    rng = random.Random(f"m6:{instance.seed}:{salt}")
    run = _Run(instance, config, budget)
    thresholds = [p.init_threshold for p in protocols]
    rules_by_agent = [_ordered(p) for p in protocols]
    fires: Counter = Counter()
    forced = 0
    faithful = 0
    weak = 0
    turns = 0
    passes_total = 0
    recent_gain = 0.0
    consecutive_low = 0
    trace: list[ShareEvent] = []

    while run.shares < run.budget and not run.done:
        agents = run.active_agents()
        if not agents:
            break
        base = len(survivors(run.board, config))
        if base <= 1:
            break
        choices = {ai: run.local_best(ai) for ai in agents}
        global_after = min(after for _, after in choices.values())
        est_needed = max(1.0, math.log(max(base, 2)) / PRIOR_LOG_STEP)

        speaker = None
        n_passes = 0
        while speaker is None and n_passes < MAX_PASSES:
            order = list(agents)
            rng.shuffle(order)
            shared_this_pass = False
            for ai in order:
                clue, after = choices[ai]
                gain = 1.0 - after / base
                metrics = {
                    "remaining_budget_ratio": (run.budget - run.shares)
                    / run.budget,
                    "estimated_slack": (run.budget - run.shares) / est_needed,
                    "public_candidate_count": float(base),
                    "my_best_gain": gain,
                    "recent_share_gain": recent_gain,
                    "consecutive_low_gain": float(consecutive_low),
                    "number_of_passes": float(n_passes),
                    "round_index": float(run.shares),
                    "my_threshold": thresholds[ai],
                }
                action = "PASS"
                fired_rule = None
                for rule in rules_by_agent[ai]:
                    if _matches(rule, metrics):
                        action = rule.action
                        fired_rule = rule.rule_id
                        break
                if fired_rule:
                    fires[fired_rule] += 1
                turns += 1
                if action == "SHARE_BEST":
                    speaker = (ai, clue, after, gain)
                    shared_this_pass = True
                    break
                if action == "RAISE_THRESHOLD":
                    thresholds[ai] = min(0.95, thresholds[ai] + THRESH_STEP)
                elif action == "LOWER_THRESHOLD":
                    thresholds[ai] = max(0.0, thresholds[ai] - THRESH_STEP)
                passes_total += 1
            if not shared_this_pass:
                n_passes += 1
        was_forced = False
        if speaker is None:  # executor safety net
            ai = order[0]
            clue, after = choices[ai]
            speaker = (ai, clue, after, 1.0 - after / base)
            was_forced = True

        _, clue, after, gain = speaker
        if after == global_after:
            faithful += 1
        if gain < 0.1:
            weak += 1
        if was_forced:
            forced += 1
        recent_gain = gain
        consecutive_low = consecutive_low + 1 if gain < 0.1 else 0
        trace.append(ShareEvent(gain=round(gain, 3), forced=was_forced,
                                base=base, after=after))
        run.commit(clue)

    acc = _best_accuracy(run.board, run.agent_clues, config)
    return ExecResult(
        seed=instance.seed,
        expected_accuracy=acc,
        solved=acc == 1.0,
        shares_used=run.shares,
        share_budget=run.budget,
        rounds_to_unique=run.rounds_to_unique,
        forced_shares=forced,
        fidelity=faithful / run.shares if run.shares else 0.0,
        weak_share_rate=weak / run.shares if run.shares else 0.0,
        pass_rate=passes_total / turns if turns else 0.0,
        rule_fires=dict(fires),
        trace=trace,
    )
