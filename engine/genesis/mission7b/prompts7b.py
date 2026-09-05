"""7B prompt builders — tiers Z/S/T plus T-Memory.

Reuses the frozen 7A leakage guard (same banned terms). The grammar
describes the extended vocabulary factually: what modes, roles,
chains, and social metrics ARE — never what they are for.
"""

from __future__ import annotations

import json
from typing import Any

from genesis.loop.interfaces import Observation
from genesis.mission7.prompts import guard
from genesis.mission7b.dsl7b import (
    MAX_CONDITIONS,
    MAX_RULES,
    N_MODES,
    N_ROLES,
    Features,
    Protocol7B,
)


def grammar(features: Features) -> str:
    metrics = features.metrics()
    parts = [f"""You are one agent in a group solving a hidden-tuple deduction
task. Agents hold private clues; sharing a clue publishes it to a common
board; the shared budget is limited. A fixed executor runs the group
protocol: agents are visited in cycles; each agent evaluates the rules by
PRIORITY (highest first) against its metrics and executes the first
matching rule; if no rule matches, the agent does PASS. A SHARE_BEST ends
the cycle. If a full cycle produces no share 6 times in a row, the
executor forces a random agent to share (logged as "forced").

METRICS (values each agent can read):
{json.dumps({m: list(v) for m, v in metrics.items()}, indent=1)}"""]
    if features.modes:
        parts.append(f"""MODES: each agent has an integer mode 0..{N_MODES - 1},
starting at 0. SET_MODE k sets it; CLEAR_MODE resets it to 0. The metric
my_mode reads the agent's own mode; rounds_since_my_action counts shares
committed since the agent last executed a non-PASS action.""")
    if features.roles:
        parts.append(f"""ROLES: agent number i has role i mod {N_ROLES}. A rule may
carry "role": k (0..{N_ROLES - 1}); it then matches only agents of that
role. A rule without "role" matches every agent.""")
    if features.chains:
        parts.append("""CHAINS: a rule's "actions" list may hold up to 2 actions,
executed in order. SHARE_BEST commits a share and ends the cycle; PASS
stops the agent's turn; threshold and mode actions apply and continue.""")
    if features.social:
        parts.append("""SOCIAL METRICS (public, same value for every agent):
total_shares, consecutive_all_pass (full silent cycles since the last
voluntary share), mean_recent_gain (mean gain of the last 3 shares),
active_speaker_count (distinct agents among the last 3 sharers).""")
    parts.append(f"""ACTIONS: {list(features.actions())}
A rule: up to {MAX_CONDITIONS} ANDed conditions ("metric op value", op "<"
or ">="), an actions list, optional "role", integer PRIORITY 0-9.
Protocol limits: at most {MAX_RULES} rules; init_threshold in [0, 0.95].

Respond with a single JSON object, no other text, one of:
 {{"op": "add", "rule": {{"conditions": [...], "actions": [{{"name": "SHARE_BEST"}}], "role": null, "priority": 5}}}}
 {{"op": "mutate", "rule_id": "...", "rule": {{...same shape...}}}}
 {{"op": "remove", "rule_id": "..."}}
 {{"op": "set_init_threshold", "value": 0.2}}""")
    return "\n\n".join(parts)


def protocol_block(protocol: Protocol7B) -> str:
    rows = []
    for r in protocol.rules:
        conds = " AND ".join(f"{c.metric} {c.op} {c.value}"
                             for c in r.conditions) or "ALWAYS"
        acts = "; ".join(a.name + (f" {a.mode}" if a.mode is not None
                                   else "") for a in r.actions)
        role = f" ROLE {r.role}" if r.role is not None else ""
        rows.append(f'  rule_id "{r.rule_id}": IF {conds} THEN {acts}'
                    f"{role} PRIORITY {r.priority}")
    body = "\n".join(rows) if rows else "  (no rules: every agent PASSes)"
    return (f"CURRENT PROTOCOL (init_threshold="
            f"{protocol.init_threshold}):\n{body}")


def aggregates_block(observation: Observation,
                     prev_rolled_back: bool | None) -> str:
    m = observation.metrics
    lines = ["OBSERVED RESULTS of the current protocol on the training "
             "instances:"]
    for key in ("mean_accuracy", "unsolved_rate", "comm_ratio",
                "weak_share_rate", "pass_rate", "forced_share_rate"):
        lines.append(f"  {key}: {m.get(key, 0.0):.3f}")
    if prev_rolled_back is not None:
        lines.append("  previous proposal round: "
                     + ("no candidate was adopted" if prev_rolled_back
                        else "a candidate was adopted"))
    return "\n".join(lines)


def trajectories_block(observation: Observation, max_runs: int = 5) -> str:
    failed = observation.events[:max_runs]
    if not failed:
        return "FAILED RUNS: none in this training batch."
    lines = [f"FAILED RUNS (first {len(failed)}, anonymized):"]
    for r in failed:
        gains = ", ".join(
            f"{e['gain']:.2f}{'(forced)' if e['forced'] else ''}"
            for e in r["trace"])
        lines.append(
            f"  budget {r['budget']}, shares {r['shares']}, "
            f"gain sequence [{gains}], candidates remaining: "
            f"{r.get('final_candidates', '?')}")
    return "\n".join(lines)


def memory_block(history: list[dict[str, Any]]) -> str:
    """T-Memory: structured what-was-tried/what-happened. Ops and
    outcomes only — observations, not advice."""
    if not history:
        return "PROPOSAL HISTORY: none yet."
    lines = ["PROPOSAL HISTORY (recent generations; op, blind score, "
             "adopted):"]
    for h in history:
        cands = ", ".join(
            f"{c['op']}:{c['score']:.3f}{'*' if c['adopted'] else ''}"
            for c in h["candidates"])
        lines.append(
            f"  gen {h['gen']} (incumbent {h['incumbent_score']:.3f}, "
            f"{'kept' if h['rolled_back'] else 'replaced'}): [{cands}]")
    lines.append("  (* = adopted)")
    return "\n".join(lines)


_FILLER = ("The sky above the harbor was a soft shade of gray that "
           "morning, and the boats moved slowly across the water while "
           "gulls circled overhead in wide unhurried loops. ")


def padding_block(target_chars: int) -> str:
    """7C control: same length as the memory block would be, zero
    information. Content is deliberately unrelated prose — no task
    words, no numbers, no reference to attempts or history."""
    if target_chars <= 0:
        return "NOTE: none."
    body = (_FILLER * (target_chars // len(_FILLER) + 1))[:target_chars]
    return f"NOTE (formatting filler):\n{body}"


def _changed_rule_sig(artifact: dict, gen: int) -> str | None:
    """Compact signature of what a candidate changed: the rule created
    at that generation (add/mutate), rendered in DSL terms."""
    if artifact is None:
        return None
    for r in artifact.get("rules", []):
        if r.get("created_gen") == gen:
            conds = " AND ".join(
                f"{c['metric']} {c['op']} {c['value']}"
                for c in r.get("conditions", [])) or "ALWAYS"
            acts = "; ".join(
                a["name"] + (f" {a['mode']}"
                             if a.get("mode") is not None else "")
                for a in r.get("actions", []))
            role = (f" ROLE {r['role']}"
                    if r.get("role") is not None else "")
            return f"IF {conds} THEN {acts}{role} P{r.get('priority')}"
    return None


def signature_block(history: list[dict[str, Any]], max_lines: int = 30) -> str:
    """TS tier: structural memory — which concrete rule changes were
    tried, how often, their best blind score, and whether any was
    adopted. Observations only; no advice."""
    if not history:
        return "TRIED CHANGES: none yet."
    agg: dict[str, dict[str, Any]] = {}
    for h in history:
        for c in h["candidates"]:
            sig = (_changed_rule_sig(c.get("artifact"), h["gen"])
                   if c.get("op") in ("add", "mutate") else
                   (c.get("op") if c.get("op") not in (None, "invalid")
                    else None))
            if sig is None:
                continue
            entry = agg.setdefault(sig, {"n": 0, "best": 0.0,
                                         "adopted": False})
            entry["n"] += 1
            entry["best"] = max(entry["best"], c.get("score") or 0.0)
            entry["adopted"] = entry["adopted"] or c.get("adopted", False)
    if not agg:
        return "TRIED CHANGES: none yet."
    lines = ["TRIED CHANGES (rule change -> times tried, best blind "
             "score, adopted?):"]
    ranked = sorted(agg.items(), key=lambda kv: -kv[1]["n"])[:max_lines]
    for sig, e in ranked:
        lines.append(f"  {sig} -> {e['n']}x, best {e['best']:.3f}, "
                     f"{'adopted' if e['adopted'] else 'not adopted'}")
    return "\n".join(lines)


def build_prompt7b(
    tier: str,
    features: Features,
    protocol: Protocol7B,
    observation: Observation,
    history: list[dict[str, Any]],
    prev_rolled_back: bool | None,
) -> str:
    parts = [grammar(features), protocol_block(protocol)]
    if tier in ("S", "T", "TM", "TP", "TS"):
        parts.append(aggregates_block(observation, prev_rolled_back))
    if tier in ("T", "TM", "TP", "TS"):
        parts.append(trajectories_block(observation))
    if tier == "TM":
        parts.append(memory_block(history))
    elif tier == "TP":
        parts.append(padding_block(len(memory_block(history))))
    elif tier == "TS":
        parts.append(signature_block(history))
    elif tier not in ("Z", "S", "T"):
        raise ValueError(f"unknown tier {tier}")
    parts.append("Propose the ONE operation you expect to most improve "
                 "the group's accuracy within the share budget. JSON only.")
    return guard("\n\n".join(parts))
