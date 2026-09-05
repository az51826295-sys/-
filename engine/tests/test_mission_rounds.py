"""M3-M4: arm runners — budget equality, determinism, completeness."""

from __future__ import annotations

from genesis.mission.config import MissionConfig
from genesis.mission.models.events import ACTION_KINDS
from genesis.mission.rounds import run_arm


def small_config(**kw) -> MissionConfig:
    base = dict(
        n_agents=3, n_rounds=4, playouts_gvr=4, playouts_gvg=4, max_turns=60
    )
    base.update(kw)
    return MissionConfig(**base)


def action_events(result):
    return [e for e in result.events if e.kind in ACTION_KINDS]


def test_budget_equality_across_arms():
    config = small_config()
    budget = config.n_agents * config.n_rounds
    for arm in ("A", "B", "C"):
        result = run_arm(arm, config, seed=1)
        assert len(action_events(result)) == budget, arm


def test_runs_are_deterministic():
    config = small_config()
    a = run_arm("C", config, seed=3)
    b = run_arm("C", config, seed=3)
    assert a.model_dump() == b.model_dump()
    c = run_arm("C", config, seed=4)
    assert a.final_proposal_id != c.final_proposal_id or a.events != c.events


def test_all_action_events_carry_utilities():
    result = run_arm("C", small_config(), seed=2)
    for e in action_events(result):
        assert e.utilities, e


def test_final_selection_and_judging():
    result = run_arm("C", small_config(), seed=5)
    assert result.n_proposals > 0
    assert result.final_proposal_id is not None
    scores = {m.proposal_id: m.objective for m in result.proposals_meta}
    assert result.final_objective == max(scores.values())
    assert result.final_spec_json


def test_b_islands_are_isolated():
    """In arm B no agent may reference another agent's artifacts."""
    result = run_arm("B", small_config(), seed=6)
    owner = {m.proposal_id: m.author_id for m in result.proposals_meta}
    owner.update(result.critique_authors)
    owner.update(result.sim_authors)
    for e in result.events:
        for ref in e.refs:
            assert owner.get(ref, e.agent_id) == e.agent_id


def test_c_removal_stops_agents():
    config = small_config(n_rounds=6)
    result = run_arm("C", config, seed=7, removal=True)
    assert len(result.removed) == config.removal_count
    removal_round = 3  # ceil(6 * 0.5)
    for e in result.events:
        if e.agent_id in result.removed and e.kind in ACTION_KINDS:
            assert e.round < removal_round


def test_a_uses_single_agent():
    result = run_arm("A", small_config(), seed=8)
    assert {e.agent_id for e in action_events(result)} == {"a0"}
