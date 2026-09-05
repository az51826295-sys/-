"""Experiment 7: leakage guard, response parsing, proposer plumbing."""

from __future__ import annotations

import json

import pytest

from genesis.mission2.config import Mission2Config
from genesis.mission6.dsl import ancestor_protocol
from genesis.mission6.evolution import (
    ProposalContext,
    build_pairs,
    evaluate,
    evaluate_results,
    evolve,
)
from genesis.mission6.lineage import audit
from genesis.mission7.prompts import (
    BANNED_TERMS,
    LeakageError,
    build_prompt,
    guard,
)
from genesis.mission7.proposers import (
    MockProvider,
    apply_operation,
    deadlock_protocol,
    llm_proposer,
    parse_response,
)

CONFIG = Mission2Config()


def _context(protocol=None) -> ProposalContext:
    pairs = build_pairs([2001], (1.5,), CONFIG)
    p = protocol or ancestor_protocol()
    results = evaluate_results(pairs, CONFIG, protocol=p)
    stats = evaluate(pairs, CONFIG, protocol=p, results=results)
    return ProposalContext(group="M", master_seed=0, gen=1, incumbent=p,
                           train_stats=stats, train_results=results)


def test_guard_blocks_banned_terms():
    for term in ("descending threshold", "I2 rules", "하강 문턱"):
        with pytest.raises(LeakageError):
            guard(f"try this: {term}")
    assert guard("plain observational text")


def test_prompts_render_clean_for_all_tiers():
    ctx = _context()
    for tier in ("Z", "S", "T"):
        prompt = build_prompt(tier, ctx)   # guard runs inside
        assert "CURRENT PROTOCOL" in prompt
        low = prompt.lower()
        assert not any(t in low for t in BANNED_TERMS)
    assert "OBSERVED RESULTS" not in build_prompt("Z", ctx)
    assert "OBSERVED RESULTS" in build_prompt("S", ctx)
    assert "FAILED RUNS" in build_prompt("T", ctx)


def test_parse_and_apply_operations():
    p = ancestor_protocol()
    assert parse_response("no json here") is None
    op = parse_response('text {"op": "set_init_threshold", "value": 0.2} tail')
    cand, label = apply_operation(p, op, "a0", 1, 0)
    assert label == "set_init_threshold" and cand.init_threshold == 0.2
    cand, label = apply_operation(p, {"op": "remove", "rule_id": "nope"},
                                  "a0", 1, 0)
    assert label == "invalid" and cand.model_dump() == p.model_dump()
    bad_rule = {"op": "add", "rule": {"action": "GLOBAL_ARGMAX"}}
    cand, label = apply_operation(p, bad_rule, "a0", 1, 0)
    assert label == "invalid"


def test_mock_pipeline_escapes_deadlock(tmp_path):
    log = str(tmp_path / "calls.jsonl")
    proposer = llm_proposer("T", MockProvider(), log)
    lineage = evolve("M", CONFIG, generations=2,
                     train_seeds=[2001, 2002], valid_seeds=[2101, 2102],
                     founding=deadlock_protocol(), proposer=proposer)
    assert audit(lineage) == []
    assert lineage.generations[-1].incumbent_score > 0.6   # escaped
    ops = [c.op for g in lineage.generations for c in g.candidates]
    assert "invalid" in ops                                # broken path used
    lines = [json.loads(x) for x in open(log, encoding="utf-8")]
    assert len(lines) == 2 * CONFIG.n_agents
    assert all("prompt" in x and "response" in x for x in lines)


def test_random_proposer_keys_unchanged():
    """Mission-6 reproducibility: with no proposer injected, agent2's
    gen-1 proposal must be the exact rule recorded in the M ms0 main-run
    lineage (g1-agent2-2: my_best_gain < 0.1 -> RAISE_THRESHOLD P9).
    Proposals depend only on the rng key, not on the seed sets."""
    lineage = evolve("M", CONFIG, generations=1,
                     train_seeds=[2001], valid_seeds=[2101])
    cand = lineage.generations[0].candidates[2]
    assert cand.proposer == "agent2" and cand.op == "add"
    rule = cand.protocol.rules[-1]
    assert rule.rule_id == "g1-agent2-2"
    assert rule.action == "RAISE_THRESHOLD" and rule.priority == 9
    assert [(c.metric, c.op, c.value) for c in rule.conditions] == [
        ("my_best_gain", "<", 0.1)]
