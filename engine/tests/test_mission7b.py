"""7B: extended DSL validation, executor semantics, proposers, space."""

from __future__ import annotations

import random

from genesis.mission2.config import Mission2Config
from genesis.mission2.exp3 import tier_instance
from genesis.mission2.exp4 import min_certificate
from genesis.mission7b.dsl7b import (
    Action,
    Condition,
    Features,
    Protocol7B,
    Rule7B,
    ancestor_protocol7b,
    propose_random,
    rule_space_size,
    validate_protocol,
    validate_rule,
)
from genesis.mission7b.executor7b import run_protocol7b
from genesis.mission7b.proposers7b import apply_operation7b

CONFIG = Mission2Config()
ALL = Features()


def _pair(seed: int = 2001, slack: float = 1.5):
    instance = tier_instance(seed, CONFIG, "medium")
    cert, _ = min_certificate(instance, CONFIG)
    return instance, max(1, round(slack * cert))


def test_ancestor_valid_and_behaves_like_free_cooperation():
    p = ancestor_protocol7b()
    assert validate_protocol(p, ALL) == []
    instance, budget = _pair()
    r = run_protocol7b(instance, CONFIG, budget, p)
    assert r.forced_shares == 0 and r.pass_rate == 0.0
    assert r.solved or r.shares_used == budget


def test_validator_rejects_out_of_vocabulary():
    bad = Rule7B(rule_id="x", actions=[Action(name="GLOBAL_ARGMAX")])
    assert validate_rule(bad, ALL)
    long_chain = Rule7B(rule_id="c", actions=[
        Action(name="PASS")] * 3)
    assert validate_rule(long_chain, ALL)
    bad_mode = Rule7B(rule_id="m",
                      actions=[Action(name="SET_MODE", mode=9)])
    assert validate_rule(bad_mode, ALL)
    bad_role = Rule7B(rule_id="r", role=7,
                      actions=[Action(name="PASS")])
    assert validate_rule(bad_role, ALL)
    # feature flags remove vocabulary
    no_modes = Features(modes=False)
    mode_rule = Rule7B(rule_id="m2",
                       actions=[Action(name="SET_MODE", mode=1)])
    assert validate_rule(mode_rule, no_modes)
    social_rule = Rule7B(
        rule_id="s", actions=[Action(name="PASS")],
        conditions=[Condition(metric="total_shares", op="<", value=4)])
    assert validate_rule(social_rule, Features(social=False))
    assert not validate_rule(social_rule, ALL)


def test_modes_and_chains_execute():
    p = Protocol7B(rules=[
        Rule7B(rule_id="setup", priority=9,
               conditions=[Condition(metric="my_mode", op="<", value=1)],
               actions=[Action(name="SET_MODE", mode=1),
                        Action(name="RAISE_THRESHOLD")]),
        Rule7B(rule_id="go", priority=5,
               conditions=[Condition(metric="my_mode", op=">=", value=1)],
               actions=[Action(name="SHARE_BEST")]),
    ])
    assert validate_protocol(p, ALL) == []
    instance, budget = _pair()
    r = run_protocol7b(instance, CONFIG, budget, p)
    assert r.rule_fires.get("setup", 0) > 0
    assert r.rule_fires.get("go", 0) > 0
    assert r.forced_shares == 0


def test_role_scoping():
    # only role-0 agents (0 and 3) may share voluntarily; once their
    # clues run out the safety net forces shares from the rest — every
    # voluntary share must come from the role rule
    p = Protocol7B(rules=[
        Rule7B(rule_id="r0share", priority=9, role=0,
               actions=[Action(name="SHARE_BEST")]),
    ])
    instance, budget = _pair()
    r = run_protocol7b(instance, CONFIG, budget, p)
    assert r.shares_used > 0
    voluntary = r.shares_used - r.forced_shares
    assert voluntary > 0
    assert r.rule_fires.get("r0share", 0) == voluntary


def test_executor_deterministic():
    p = ancestor_protocol7b()
    instance, budget = _pair()
    assert (run_protocol7b(instance, CONFIG, budget, p)
            == run_protocol7b(instance, CONFIG, budget, p))


def test_random_proposals_always_valid():
    rng = random.Random(11)
    protocol = ancestor_protocol7b()
    for i in range(300):
        protocol, op = propose_random(protocol, rng, ALL, "a", i, i)
        assert validate_protocol(protocol, ALL) == [], op


def test_space_size_explodes_vs_7a_equivalent():
    flat = rule_space_size(Features(modes=False, roles=False,
                                    chains=False, social=False))
    full = rule_space_size(ALL)
    assert full > 100 * flat


def test_padding_tier_renders_matched_and_clean():
    from genesis.loop.interfaces import Observation
    from genesis.mission7.prompts import BANNED_TERMS
    from genesis.mission7b.prompts7b import build_prompt7b, memory_block

    obs = Observation(metrics={"mean_accuracy": 0.5}, events=[])
    history = [{"gen": g, "rolled_back": True, "incumbent_score": 0.5,
                "candidates": [{"op": "add", "score": 0.4,
                                "adopted": False}] * 6}
               for g in range(1, 6)]
    p = ancestor_protocol7b()
    tp = build_prompt7b("TP", ALL, p, obs, history, True)
    tm = build_prompt7b("TM", ALL, p, obs, history, True)
    t = build_prompt7b("T", ALL, p, obs, history, True)
    # padding must not leak history facts, must match memory length
    assert "PROPOSAL HISTORY" not in tp and "(* = adopted)" not in tp
    mem_len = len(memory_block(history))
    assert abs((len(tp) - len(t)) - mem_len - len("NOTE (formatting filler):\n") + len("")) < 60
    assert len(tm) > len(t)
    low = tp.lower()
    assert not any(term in low for term in BANNED_TERMS)


def test_signature_tier_renders_structural_memory():
    from genesis.loop.interfaces import Observation
    from genesis.mission7.prompts import BANNED_TERMS
    from genesis.mission7b.prompts7b import build_prompt7b

    art = {"rules": [
        {"rule_id": "g2-a0-0", "created_gen": 2, "priority": 7,
         "conditions": [{"metric": "consecutive_all_pass", "op": ">=",
                         "value": 2.0}],
         "actions": [{"name": "SHARE_BEST", "mode": None}],
         "role": None},
    ]}
    history = [{"gen": 2, "rolled_back": True, "incumbent_score": 0.77,
                "candidates": [{"op": "add", "score": 0.75,
                                "adopted": False, "artifact": art}] * 3}]
    obs = Observation(metrics={}, events=[])
    ts = build_prompt7b("TS", ALL, ancestor_protocol7b(), obs, history,
                        True)
    assert "TRIED CHANGES" in ts
    assert "consecutive_all_pass >= 2.0" in ts and "3x" in ts
    assert "not adopted" in ts
    low = ts.lower()
    assert not any(t in low for t in BANNED_TERMS)


def test_apply_operation7b_paths():
    p = ancestor_protocol7b()
    ok = {"op": "add", "rule": {
        "conditions": [{"metric": "mean_recent_gain", "op": "<",
                        "value": 0.1}],
        "actions": [{"name": "SET_MODE", "mode": 2},
                    {"name": "PASS"}],
        "role": 1, "priority": 7}}
    cand, label = apply_operation7b(p, ok, ALL, "a0", 1, 0)
    assert label == "add" and len(cand.rules) == 2
    bad = {"op": "add", "rule": {"actions": [{"name": "SET_MODE"}]}}
    cand, label = apply_operation7b(p, bad, ALL, "a0", 1, 0)
    assert label == "invalid" and cand.model_dump() == p.model_dump()
    gone = {"op": "remove", "rule_id": "nope"}
    assert apply_operation7b(p, gone, ALL, "a0", 1, 0)[1] == "invalid"
