"""Prompt builders for the three information tiers, and the leakage
guard (design section 3 — frozen at pre-registration).

Prompts carry OBSERVATIONS only. No interpretation, no strategy words,
no experiment-5 concepts. The guard runs on every rendered prompt and
raises on violation — a tripped guard is a bug in the builder, never
something to catch and ignore.
"""

from __future__ import annotations

import json

from genesis.mission6.dsl import ACTIONS, MAX_CONDITIONS, MAX_RULES, METRICS, Protocol
from genesis.mission6.evolution import ProposalContext

# Frozen banned list. DSL tokens (RAISE_THRESHOLD, ...) are grammar
# vocabulary and allowed; these are interpretation/strategy terms.
BANNED_TERMS = (
    "하강", "경매", "억제", "양보",
    "약한 단서", "낮은 가치",
    "i2", "auction", "descending", "suppress", "yield",
    "weak clue", "low-value", "waste",
    "mission 5", "mission5", "실험 5",
)


class LeakageError(RuntimeError):
    pass


def guard(prompt: str) -> str:
    low = prompt.lower()
    hits = [t for t in BANNED_TERMS if t in low]
    if hits:
        raise LeakageError(f"banned terms in prompt: {hits}")
    return prompt


GRAMMAR = f"""You are one agent in a group of agents solving a hidden-tuple
deduction task. Agents hold private clues; sharing a clue publishes it to a
common board; the shared budget is limited. A fixed executor runs the group
protocol: agents are visited in cycles; each agent evaluates the protocol's
rules by PRIORITY (highest first) against its local metrics and performs the
first matching action; if no rule matches, the agent does PASS. A SHARE_BEST
ends the cycle. If a full cycle produces no share {6} times in a row, the
executor forces a random agent to share (logged as "forced").

You may propose exactly ONE operation on the group protocol, in this rule
language (nothing outside it is accepted):

METRICS (each agent computes these locally):
{json.dumps({m: list(v) for m, v in METRICS.items()}, indent=1)}
  - remaining_budget_ratio: remaining shares / total budget
  - estimated_slack: remaining shares / estimated shares still needed
  - public_candidate_count: tuples consistent with the public board
  - my_best_gain: 1 - (candidates after my best clue / candidates now)
  - recent_share_gain: the gain of the last committed share
  - consecutive_low_gain: committed shares in a row with gain < 0.1
  - number_of_passes: full no-share cycles in the current round
  - round_index: shares committed so far
  - my_threshold: this agent's adjustable threshold value (starts at
    init_threshold; RAISE_THRESHOLD / LOWER_THRESHOLD move it by 0.1)

ACTIONS: {list(ACTIONS)}
A rule: IF <up to {MAX_CONDITIONS} conditions, ANDed, each "metric op value"
with op "<" or ">="> THEN <action>, with an integer PRIORITY 0-9.
Protocol limits: at most {MAX_RULES} rules; init_threshold in [0, 0.95].

Respond with a single JSON object, no other text, one of:
 {{"op": "add", "rule": {{"conditions": [{{"metric": "...", "op": "<", "value": 0.5}}], "action": "...", "priority": 5}}}}
 {{"op": "mutate", "rule_id": "...", "rule": {{...same shape...}}}}
 {{"op": "remove", "rule_id": "..."}}
 {{"op": "set_init_threshold", "value": 0.2}}
"""


def _protocol_block(protocol: Protocol) -> str:
    rules = []
    for r in protocol.rules:
        conds = " AND ".join(
            f"{c.metric} {c.op} {c.value}" for c in r.conditions) or "ALWAYS"
        rules.append(f'  rule_id "{r.rule_id}": IF {conds} '
                     f"THEN {r.action} PRIORITY {r.priority}")
    body = "\n".join(rules) if rules else "  (no rules: every agent PASSes)"
    return (f"CURRENT PROTOCOL (init_threshold="
            f"{protocol.init_threshold}):\n{body}")


def _aggregates_block(context: ProposalContext) -> str:
    s = context.train_stats
    lines = [
        "OBSERVED RESULTS of the current protocol on "
        f"{len(context.train_results)} training instances:",
        f"  mean accuracy: {s.mean_accuracy:.3f}",
        f"  runs not fully solved: {s.unsolved_rate:.3f}",
        f"  budget used (shares/budget): {s.comm_ratio:.3f}",
        f"  shares with gain < 0.1: {s.weak_share_rate:.3f}",
        f"  PASS actions per agent turn: {s.pass_rate:.3f}",
        f"  runs with at least one forced share: {s.forced_share_rate:.3f}",
    ]
    if context.prev_rolled_back is not None:
        lines.append(
            "  your society's previous proposal round: "
            + ("no candidate was adopted"
               if context.prev_rolled_back else "a candidate was adopted"))
    return "\n".join(lines)


def _trajectories_block(context: ProposalContext, max_runs: int = 5) -> str:
    failed = [r for r in context.train_results if not r.solved][:max_runs]
    if not failed:
        return "FAILED RUNS: none in this training batch."
    lines = [f"FAILED RUNS (first {len(failed)}, anonymized):"]
    for r in failed:
        gains = ", ".join(
            f"{e.gain:.2f}{'(forced)' if e.forced else ''}" for e in r.trace)
        lines.append(
            f"  budget {r.share_budget}, shares committed {r.shares_used}, "
            f"gain sequence [{gains}], "
            f"candidates remaining at end: {int(1 / r.expected_accuracy) if r.expected_accuracy > 0 else 'many'}")
    return "\n".join(lines)


def build_prompt(tier: str, context: ProposalContext) -> str:
    parts = [GRAMMAR, _protocol_block(context.incumbent)]
    if tier in ("S", "T"):
        parts.append(_aggregates_block(context))
    if tier == "T":
        parts.append(_trajectories_block(context))
    elif tier not in ("Z", "S"):
        raise ValueError(f"unknown tier {tier}")
    parts.append("Propose the ONE operation you expect to most improve "
                 "the group's accuracy within the share budget. JSON only.")
    return guard("\n\n".join(parts))
