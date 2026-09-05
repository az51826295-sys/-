"""Experiment 6: DSL safety, executor semantics, evolution mechanics."""

from __future__ import annotations

import random

import pytest

from genesis.mission2.config import Mission2Config
from genesis.mission2.exp3 import tier_instance
from genesis.mission2.exp4 import min_certificate
from genesis.mission6.dsl import (
    ACTIONS,
    MAX_RULES,
    Condition,
    Protocol,
    Rule,
    ancestor_protocol,
    propose,
    validate_protocol,
    validate_rule,
)
from genesis.mission6.evolution import build_pairs, evaluate, evolve
from genesis.mission6.executor import run_protocol
from genesis.mission6.lineage import audit

CONFIG = Mission2Config()


def _pair(seed: int = 2001, slack: float = 1.5):
    instance = tier_instance(seed, CONFIG, "medium")
    cert, _ = min_certificate(instance, CONFIG)
    return instance, max(1, round(slack * cert))


# ------------------------------------------------------------------- DSL


def test_ancestor_is_valid_and_minimal():
    p = ancestor_protocol()
    assert validate_protocol(p) == []
    assert len(p.rules) == 1
    assert p.rules[0].action == "SHARE_BEST"
    assert p.rules[0].conditions == []


def test_validator_rejects_forbidden_vocabulary():
    bad_action = Rule(rule_id="x", action="GLOBAL_ARGMAX")
    assert validate_rule(bad_action)
    bad_metric = Rule(
        rule_id="y", action="PASS",
        conditions=[Condition(metric="other_agent_clues", op="<", value=1)],
    )
    assert validate_rule(bad_metric)
    too_many_conds = Rule(
        rule_id="z", action="PASS",
        conditions=[Condition(metric="round_index", op="<", value=2)] * 3,
    )
    assert validate_rule(too_many_conds)
    fat = Protocol(rules=[
        Rule(rule_id=f"r{i}", action="PASS") for i in range(MAX_RULES + 1)
    ])
    assert validate_protocol(fat)


def test_propose_always_yields_valid_protocols():
    rng = random.Random(7)
    protocol = ancestor_protocol()
    for i in range(300):
        protocol, op = propose(protocol, rng, "a0", gen=i, rule_seq=i)
        assert validate_protocol(protocol) == [], op


# -------------------------------------------------------------- executor


def test_ancestor_behaves_like_free_cooperation():
    instance, budget = _pair()
    r = run_protocol(instance, CONFIG, budget, protocol=ancestor_protocol())
    # ALWAYS -> SHARE_BEST: no passes, no forced shares, budget consumed
    # unless solved earlier
    assert r.forced_shares == 0
    assert r.pass_rate == 0.0
    assert r.solved or r.shares_used == budget


def test_always_pass_triggers_safety_net():
    instance, budget = _pair()
    lazy = Protocol(rules=[Rule(rule_id="p", action="PASS")])
    r = run_protocol(instance, CONFIG, budget, protocol=lazy)
    assert r.shares_used > 0
    assert r.forced_shares == r.shares_used


def test_executor_is_deterministic():
    instance, budget = _pair()
    p = ancestor_protocol()
    a = run_protocol(instance, CONFIG, budget, protocol=p)
    b = run_protocol(instance, CONFIG, budget, protocol=p)
    assert a == b


def test_per_agent_protocols():
    instance, budget = _pair()
    silent = Protocol(rules=[Rule(rule_id="p", action="PASS")])
    society = [silent] + [ancestor_protocol()] * (CONFIG.n_agents - 1)
    r = run_protocol(instance, CONFIG, budget, per_agent=society)
    assert r.shares_used > 0
    # agent 0 never shares voluntarily; the sharers' rule must fire
    assert r.rule_fires.get("r0", 0) > 0
    with pytest.raises(ValueError):
        run_protocol(instance, CONFIG, budget)
    with pytest.raises(ValueError):
        run_protocol(instance, CONFIG, budget,
                     protocol=silent, per_agent=society)


def test_threshold_rules_fire():
    instance, budget = _pair()
    p = Protocol(rules=[
        Rule(rule_id="up",
             conditions=[Condition(metric="my_threshold", op="<", value=0.3)],
             action="RAISE_THRESHOLD", priority=5),
        Rule(rule_id="share",
             conditions=[Condition(metric="my_threshold", op=">=", value=0.3)],
             action="SHARE_BEST", priority=1),
    ])
    r = run_protocol(instance, CONFIG, budget, protocol=p)
    assert r.rule_fires.get("up", 0) > 0
    assert r.rule_fires.get("share", 0) > 0
    assert r.forced_shares == 0


# -------------------------------------------------------------- evolution


def test_score_penalizes_complexity():
    pairs = build_pairs([2001], (1.5,), CONFIG)
    lean = evaluate(pairs, CONFIG, protocol=ancestor_protocol())
    fat_protocol = ancestor_protocol()
    for i in range(5):
        fat_protocol.rules.append(Rule(
            rule_id=f"dead{i}", action="SHARE_BEST", priority=-1,
            conditions=[Condition(metric="round_index", op=">=", value=999)],
        ))
    fat = evaluate(pairs, CONFIG, protocol=fat_protocol)
    assert fat.mean_accuracy == lean.mean_accuracy  # dead rules never fire
    assert fat.score < lean.score


@pytest.mark.parametrize("group", ["M", "K", "J", "L"])
def test_evolution_mechanics_and_audit(group):
    lineage = evolve(group, CONFIG, generations=2,
                     train_seeds=[2001, 2002], valid_seeds=[2101, 2102])
    assert audit(lineage) == []
    assert len(lineage.generations) == 2
    for g in lineage.generations:
        assert len(g.candidates) == CONFIG.n_agents
        assert g.train is not None
    if group == "J":
        assert lineage.final_per_agent is not None
        assert len(lineage.final_per_agent) == CONFIG.n_agents
    else:
        final = lineage.final_protocol()
        assert final.version == lineage.generations[-1].incumbent_version_after
    if group == "L":
        assert all(c.proposer == "designer"
                   for g in lineage.generations for c in g.candidates)


def test_m_incumbent_score_never_falls():
    lineage = evolve("M", CONFIG, generations=3,
                     train_seeds=[2001, 2002], valid_seeds=[2101, 2102])
    scores = [g.incumbent_score for g in lineage.generations]
    assert all(b >= a - 1e-9 for a, b in zip(scores, scores[1:]))


def test_evolution_is_deterministic():
    kwargs = dict(train_seeds=[2001], valid_seeds=[2101])
    a = evolve("M", CONFIG, generations=2, **kwargs)
    b = evolve("M", CONFIG, generations=2, **kwargs)
    assert a.model_dump() == b.model_dump()


# -------------------------------------------------------------- ablation


def test_ablation_helpers_run_on_toy_protocol():
    from genesis.mission6.ablation import (
        leave_one_rule_out,
        parameter_reset,
        priority_shuffle,
    )

    final = ancestor_protocol()
    final.rules.append(Rule(
        rule_id="g1-x", action="PASS", priority=3,
        conditions=[Condition(metric="my_best_gain", op="<", value=0.1)],
        created_gen=1,
    ))
    seeds = [3001, 3002]
    loo = leave_one_rule_out(final, CONFIG, test_seeds=seeds)
    assert [name for name, _ in loo] == ["full", "-r0", "-g1-x"]
    shuffles = priority_shuffle(final, CONFIG, n=2, test_seeds=seeds)
    assert len(shuffles) == 2
    resets = parameter_reset(final, CONFIG, test_seeds=seeds)
    assert resets["threshold_reset"].mean_accuracy > 0


def test_evolve_accepts_founding_protocol():
    founding = ancestor_protocol()
    founding.rules.append(Rule(
        rule_id="seeded", action="PASS", priority=1,
        conditions=[Condition(metric="my_best_gain", op="<", value=0.05)],
    ))
    lineage = evolve("M", CONFIG, generations=1,
                     train_seeds=[2001], valid_seeds=[2101],
                     founding=founding)
    assert audit(lineage) == []
    v0 = lineage.protocols["0"]
    assert any(r.rule_id == "seeded" for r in v0.rules)
