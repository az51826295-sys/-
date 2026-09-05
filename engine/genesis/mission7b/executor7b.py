"""Fixed 7B executor — agents cannot modify this code.

Semantics (frozen at pre-registration; docs/mission7b-design.md):
- Speaking cycles as in 7A: shuffled visits, first matching rule by
  priority (desc, tie by rule_id), SHARE_BEST ends the cycle, MAX_PASSES
  full silent passes force a share (logged).
- Roles: agent role = index mod 3. A rule with role=k only matches
  agents of that role; role=None matches everyone.
- Modes: per-agent integer 0..3, starts 0. SET_MODE k / CLEAR_MODE.
- Chains: a rule's actions run in order. SHARE_BEST commits and ends
  the cycle; PASS stops the agent's turn; threshold and mode actions
  apply and continue.
- Social metrics (public): total_shares, consecutive_all_pass (full
  silent passes since the last voluntary share), mean_recent_gain
  (last 3 commits), active_speaker_count (distinct sharers in the last
  3 commits).
- rounds_since_my_action: commits since the agent last executed any
  non-PASS action.
- rng keyed by instance seed only (mission 6 lesson).
"""

from __future__ import annotations

import math
import random
from collections import Counter

from genesis.mission2.clues import Instance
from genesis.mission2.config import Mission2Config
from genesis.mission2.exp3 import _Run
from genesis.mission2.groups import _best_accuracy
from genesis.mission2.solver import survivors
from genesis.mission6.executor import ExecResult, ShareEvent
from genesis.mission7b.dsl7b import Protocol7B, Rule7B

MAX_PASSES = 6
PRIOR_LOG_STEP = 0.7
THRESH_STEP = 0.1


def _matches(rule: Rule7B, role: int, metrics: dict[str, float]) -> bool:
    if rule.role is not None and rule.role != role:
        return False
    for c in rule.conditions:
        v = metrics.get(c.metric)
        if v is None:
            return False
        if c.op == "<" and not v < c.value:
            return False
        if c.op == ">=" and not v >= c.value:
            return False
    return True


def run_protocol7b(
    instance: Instance,
    config: Mission2Config,
    budget: int,
    protocol: Protocol7B,
    salt: int = 0,
) -> ExecResult:
    rng = random.Random(f"m7b:{instance.seed}:{salt}")
    run = _Run(instance, config, budget)
    n = config.n_agents
    thresholds = [protocol.init_threshold] * n
    modes = [0] * n
    since_action = [0] * n
    ordered = sorted(protocol.rules, key=lambda r: (-r.priority, r.rule_id))
    fires: Counter = Counter()
    forced = 0
    faithful = 0
    weak = 0
    turns = 0
    passes_total = 0
    recent_gain = 0.0
    consecutive_low = 0
    consecutive_all_pass = 0
    recent_gains: list[float] = []
    recent_speakers: list[int] = []
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
                    "my_mode": float(modes[ai]),
                    "rounds_since_my_action": float(since_action[ai]),
                    "total_shares": float(run.shares),
                    "consecutive_all_pass": float(consecutive_all_pass),
                    "mean_recent_gain": (
                        sum(recent_gains) / len(recent_gains)
                        if recent_gains else 0.0),
                    "active_speaker_count": float(len(set(recent_speakers))),
                }
                fired_rule = None
                for rule in ordered:
                    if _matches(rule, ai % 3, metrics):
                        fired_rule = rule
                        break
                turns += 1
                acted = False
                if fired_rule is not None:
                    fires[fired_rule.rule_id] += 1
                    for action in fired_rule.actions:
                        if action.name == "SHARE_BEST":
                            speaker = (ai, clue, after, gain)
                            shared_this_pass = True
                            acted = True
                            break
                        if action.name == "PASS":
                            break
                        if action.name == "RAISE_THRESHOLD":
                            thresholds[ai] = min(0.95,
                                                 thresholds[ai] + THRESH_STEP)
                            acted = True
                        elif action.name == "LOWER_THRESHOLD":
                            thresholds[ai] = max(0.0,
                                                 thresholds[ai] - THRESH_STEP)
                            acted = True
                        elif action.name == "SET_MODE":
                            modes[ai] = action.mode or 0
                            acted = True
                        elif action.name == "CLEAR_MODE":
                            modes[ai] = 0
                            acted = True
                if acted:
                    since_action[ai] = 0
                if speaker is not None:
                    break
                passes_total += 1
            if not shared_this_pass:
                n_passes += 1
                consecutive_all_pass += 1
        was_forced = False
        if speaker is None:  # executor safety net
            ai = order[0]
            clue, after = choices[ai]
            speaker = (ai, clue, after, 1.0 - after / base)
            was_forced = True
        else:
            consecutive_all_pass = 0

        sai, clue, after, gain = speaker
        if after == global_after:
            faithful += 1
        if gain < 0.1:
            weak += 1
        if was_forced:
            forced += 1
        recent_gain = gain
        consecutive_low = consecutive_low + 1 if gain < 0.1 else 0
        recent_gains = (recent_gains + [gain])[-3:]
        recent_speakers = (recent_speakers + [sai])[-3:]
        for other in range(n):
            since_action[other] += 1
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
