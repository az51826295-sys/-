"""7B proposers behind the generic loop ProposerP contract.

Same fairness accounting as 7A: unparseable/invalid responses consume
the proposal slot as an unchanged incumbent copy labeled 'invalid'.
Providers (Mock/Anthropic) are reused from mission 7 — the spend gate
and retry logic carry over unchanged.
"""

from __future__ import annotations

import json
import random
from typing import Any

from genesis.loop.interfaces import CandidateProposal, Observation
from genesis.mission7.proposers import parse_response
from genesis.mission7b.dsl7b import (
    Action,
    Condition,
    Features,
    Protocol7B,
    Rule7B,
    propose_random,
    validate_protocol,
)
from genesis.mission7b.prompts7b import build_prompt7b


def _rule_from_payload(payload: dict, rule_id: str, author: str,
                       gen: int) -> Rule7B:
    return Rule7B(
        rule_id=rule_id,
        conditions=[Condition(**c) for c in payload.get("conditions", [])],
        actions=[Action(**a) if isinstance(a, dict)
                 else Action(name=str(a))
                 for a in payload.get("actions", [])],
        role=payload.get("role"),
        priority=int(payload.get("priority", 0)),
        author_id=author,
        created_gen=gen,
    )


def apply_operation7b(
    incumbent: Protocol7B, op: dict, features: Features,
    author: str, gen: int, seq: int,
) -> tuple[Protocol7B, str]:
    candidate = incumbent.model_copy(deep=True)
    try:
        kind = op["op"]
        if kind == "add":
            candidate.rules.append(_rule_from_payload(
                op["rule"], f"g{gen}-{author}-{seq}", author, gen))
        elif kind == "mutate":
            idx = next(i for i, r in enumerate(candidate.rules)
                       if r.rule_id == op["rule_id"])
            keep_id = candidate.rules[idx].rule_id
            candidate.rules[idx] = _rule_from_payload(
                op["rule"], keep_id, author, gen)
        elif kind == "remove":
            before = len(candidate.rules)
            candidate.rules = [r for r in candidate.rules
                               if r.rule_id != op["rule_id"]]
            if len(candidate.rules) == before:
                return incumbent.model_copy(deep=True), "invalid"
        elif kind == "set_init_threshold":
            candidate.init_threshold = round(float(op["value"]), 2)
        else:
            return incumbent.model_copy(deep=True), "invalid"
    except (KeyError, StopIteration, TypeError, ValueError):
        return incumbent.model_copy(deep=True), "invalid"
    if validate_protocol(candidate, features):
        return incumbent.model_copy(deep=True), "invalid"
    return candidate, kind


class RandomProposer7B:
    """R baseline over the full extended space."""

    def __init__(self, features: Features, master_seed: int = 0):
        self.features = features
        self.master_seed = master_seed

    def propose(self, incumbent: Protocol7B, observation: Observation,
                history: list[dict[str, Any]], seq: int,
                gen: int) -> CandidateProposal:
        rng = random.Random(
            f"m7b:R:{self.master_seed}:gen{gen}:prop{seq}")
        candidate, op = propose_random(
            incumbent, rng, self.features, f"agent{seq}", gen, seq)
        return CandidateProposal(proposer=f"agent{seq}", op=op,
                                 artifact=candidate)


class LLMProposer7B:
    def __init__(self, tier: str, features: Features, provider,
                 log_path: str, temperature: float = 1.0):
        self.tier = tier
        self.features = features
        self.provider = provider
        self.log_path = log_path
        self.temperature = temperature
        self.prev_rolled_back: bool | None = None

    def propose(self, incumbent: Protocol7B, observation: Observation,
                history: list[dict[str, Any]], seq: int,
                gen: int) -> CandidateProposal:
        prev = history[-1]["rolled_back"] if history else None
        prompt = build_prompt7b(self.tier, self.features, incumbent,
                                observation, history, prev)
        response = self.provider.complete(prompt, self.temperature,
                                          gen, seq)
        op = parse_response(response)
        author = f"agent{seq}"
        if op is None:
            candidate, label = incumbent.model_copy(deep=True), "invalid"
        else:
            candidate, label = apply_operation7b(
                incumbent, op, self.features, author, gen, seq)
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps({
                "gen": gen, "seq": seq, "tier": self.tier,
                "provider": self.provider.name,
                "temperature": self.temperature,
                "prompt": prompt, "response": response,
                "parsed": op, "label": label,
                "provider_usage": dict(
                    getattr(self.provider, "usage", {})),
            }, ensure_ascii=False) + "\n")
        return CandidateProposal(proposer=author, op=label,
                                 artifact=candidate)


class MockProvider7B:
    """PIPELINE VERIFICATION ONLY — scripted, reads rule_ids from the
    prompt, exercises every op kind including the invalid path and the
    7B-only vocabulary (mode, role, chain)."""

    name = "mock7b"

    def complete(self, prompt: str, temperature: float, gen: int,
                 seq: int) -> str:
        import re
        rule_ids = re.findall(r'rule_id "([^"]+)"', prompt)
        script = seq % 6
        if script == 0:
            return json.dumps({"op": "add", "rule": {
                "conditions": [{"metric": "my_best_gain", "op": ">=",
                                "value": 0.3}],
                "actions": [{"name": "SHARE_BEST"}], "priority": 9}})
        if script == 1:
            return json.dumps({"op": "add", "rule": {
                "conditions": [{"metric": "consecutive_all_pass",
                                "op": ">=", "value": 2}],
                "actions": [{"name": "SET_MODE", "mode": 1},
                            {"name": "LOWER_THRESHOLD"}],
                "role": 1, "priority": 4}})
        if script == 2:
            return "not json"
        if script == 3 and rule_ids:
            return json.dumps({"op": "remove", "rule_id": rule_ids[0]})
        if script == 4:
            return json.dumps({"op": "set_init_threshold", "value": 0.1})
        return json.dumps({"op": "add", "rule": {
            "conditions": [{"metric": "number_of_passes", "op": ">=",
                            "value": 2}],
            "actions": [{"name": "SHARE_BEST"}], "priority": 3}})
