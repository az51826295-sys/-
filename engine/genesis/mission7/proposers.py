"""LLM proposers behind the mission-6 Proposer interface.

An invalid or unparseable response still consumes one proposal slot
(fair accounting): the candidate is then an unchanged copy of the
incumbent, labeled "invalid". Every call is appended to a JSONL log
(prompt, response, parse result) — the full audit trail the
pre-registration requires.

The real provider refuses to run without GENESIS_SPEND=i-approve, the
same contract as ai-workforce's llm.ts: nothing costs money unless the
user explicitly unlocked it.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request

from genesis.mission6.dsl import (
    Condition,
    Protocol,
    Rule,
    validate_protocol,
)
from genesis.mission6.evolution import ProposalContext, Proposer
from genesis.mission7.prompts import build_prompt

DEFAULT_MODEL = "claude-haiku-4-5-20251001"
DEFAULT_TEMPERATURE = 1.0


# ------------------------------------------------------------- apply an op


def _rule_from_payload(payload: dict, rule_id: str, author: str,
                       gen: int) -> Rule:
    return Rule(
        rule_id=rule_id,
        conditions=[Condition(**c) for c in payload.get("conditions", [])],
        action=str(payload.get("action", "")),
        priority=int(payload.get("priority", 0)),
        author_id=author,
        created_gen=gen,
    )


def apply_operation(
    incumbent: Protocol, op: dict, author: str, gen: int, seq: int
) -> tuple[Protocol, str]:
    """Returns (candidate, label). Any failure -> unchanged incumbent,
    label 'invalid'."""
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
    if validate_protocol(candidate):
        return incumbent.model_copy(deep=True), "invalid"
    return candidate, kind


def parse_response(text: str) -> dict | None:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


# ------------------------------------------------------------- providers


class MockProvider:
    """Deterministic scripted provider for PIPELINE VERIFICATION ONLY.

    It reads rule_ids out of the prompt (so the prompt->response loop is
    genuinely exercised) and cycles through scripted operations,
    including a deliberately broken one to test the invalid path. Its
    behavior encodes the known answer — never a result.
    """

    name = "mock"

    def complete(self, prompt: str, temperature: float, gen: int,
                 seq: int) -> str:
        rule_ids = re.findall(r'rule_id "([^"]+)"', prompt)
        script = seq % 6
        if script == 0:
            return json.dumps({"op": "add", "rule": {
                "conditions": [{"metric": "my_best_gain", "op": ">=",
                                "value": 0.3}],
                "action": "SHARE_BEST", "priority": 9}})
        if script == 1 and rule_ids:
            return json.dumps({"op": "remove", "rule_id": rule_ids[0]})
        if script == 2:
            return "this is not json at all"          # invalid path
        if script == 3:
            return json.dumps({"op": "set_init_threshold", "value": 0.2})
        if script == 4 and rule_ids:
            return json.dumps({"op": "mutate", "rule_id": rule_ids[-1],
                               "rule": {"conditions": [
                                   {"metric": "my_best_gain", "op": ">=",
                                    "value": 0.5}],
                                   "action": "SHARE_BEST", "priority": 8}})
        return json.dumps({"op": "add", "rule": {
            "conditions": [{"metric": "number_of_passes", "op": ">=",
                            "value": 2}],
            "action": "SHARE_BEST", "priority": 3}})


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, model: str = DEFAULT_MODEL,
                 temperature: float = DEFAULT_TEMPERATURE,
                 max_tokens: int = 512):
        if os.environ.get("GENESIS_SPEND") != "i-approve":
            raise RuntimeError(
                "paid path locked: set GENESIS_SPEND=i-approve "
                "(user approval required before any API spend)")
        self.api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not self.api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not set")
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.usage = {"calls": 0, "input_tokens": 0, "output_tokens": 0}

    def complete(self, prompt: str, temperature: float, gen: int,
                 seq: int) -> str:
        body = json.dumps({
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }).encode()
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=body,
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        )
        # transient network/5xx/429 errors must not kill a multi-hour
        # run; auth errors (401/403) fail fast
        data = None
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    data = json.loads(resp.read())
                break
            except urllib.error.HTTPError as e:
                body = ""
                try:
                    body = e.read().decode("utf-8", "replace")[:500]
                except Exception:
                    pass
                if e.code in (401, 403) or attempt == 4:
                    raise RuntimeError(
                        f"HTTP {e.code} after {attempt + 1} tries: "
                        f"{body}") from e
            except (urllib.error.URLError, TimeoutError, OSError):
                if attempt == 4:
                    raise
            time.sleep(2 ** attempt * 5)
        usage = data.get("usage", {})
        self.usage["calls"] += 1
        self.usage["input_tokens"] += usage.get("input_tokens", 0)
        self.usage["output_tokens"] += usage.get("output_tokens", 0)
        return "".join(block.get("text", "")
                       for block in data.get("content", []))


# ------------------------------------------------------------- the proposer


def llm_proposer(
    tier: str,
    provider,
    log_path: str,
    temperature: float = DEFAULT_TEMPERATURE,
) -> Proposer:
    def proposer(context: ProposalContext, seq: int) -> tuple[Protocol, str]:
        author = f"agent{seq}"
        prompt = build_prompt(tier, context)
        response = provider.complete(prompt, temperature, context.gen, seq)
        op = parse_response(response)
        if op is None:
            candidate, label = context.incumbent.model_copy(deep=True), "invalid"
        else:
            candidate, label = apply_operation(
                context.incumbent, op, author, context.gen, seq)
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps({
                "gen": context.gen, "seq": seq, "tier": tier,
                "provider": provider.name, "temperature": temperature,
                "prompt_chars": len(prompt), "prompt": prompt,
                "response": response, "parsed": op, "label": label,
                "provider_usage": dict(getattr(provider, "usage", {})),
            }, ensure_ascii=False) + "\n")
        return candidate, label

    return proposer


def deadlock_protocol() -> Protocol:
    """ms2's terminal protocol — the total-suppression attractor
    (rebuilt in code so escape runs do not depend on the data file)."""
    return Protocol(version=0, rules=[
        Rule(rule_id="g1-agent4-4",
             conditions=[Condition(metric="consecutive_low_gain", op="<",
                                   value=3.0)],
             action="RAISE_THRESHOLD", priority=8,
             author_id="agent4", created_gen=1),
    ])
