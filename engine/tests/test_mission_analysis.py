"""M5: detectors validated on synthetic logs with known ground truth
(design 8, same discipline as stage1 8.4)."""

from __future__ import annotations

from genesis.mission.analysis.lineage import lineage_metrics
from genesis.mission.analysis.roles import (
    cluster_roles,
    context_responsiveness,
    differentiation,
    jsd,
)
from genesis.mission.models import BoardEvent
from genesis.mission.rounds import ProposalMeta, RunResult


def events_for(agent_id: str, kinds: list[str], start_round: int = 1):
    return [
        BoardEvent(round=start_round + i, agent_id=agent_id, kind=k, artifact_id=f"x{i}")
        for i, k in enumerate(kinds)
    ]


def test_differentiation_separates_roles_from_clones():
    specialists = (
        events_for("a0", ["PROPOSE"] * 8)
        + events_for("a1", ["CRITIQUE"] * 8)
        + events_for("a2", ["SIMULATE"] * 8)
    )
    clones = (
        events_for("a0", ["PROPOSE", "CRITIQUE", "SIMULATE", "MODIFY"] * 2)
        + events_for("a1", ["PROPOSE", "CRITIQUE", "SIMULATE", "MODIFY"] * 2)
        + events_for("a2", ["PROPOSE", "CRITIQUE", "SIMULATE", "MODIFY"] * 2)
    )
    ids = ["a0", "a1", "a2"]
    assert differentiation(specialists, ids) > 0.9
    assert differentiation(clones, ids) < 0.01


def test_cluster_labels_match_injected_roles():
    events = (
        events_for("a0", ["PROPOSE"] * 8)
        + events_for("a1", ["PROPOSE"] * 8)
        + events_for("a2", ["CRITIQUE"] * 8)
        + events_for("a3", ["SIMULATE"] * 8)
    )
    roles = cluster_roles(events, ["a0", "a1", "a2", "a3"], k=3)
    assert roles["a0"] == roles["a1"] == "제안자"
    assert roles["a2"] == "비평가"
    assert roles["a3"] == "실험자"


def test_context_responsiveness_detects_behavior_shift():
    shifter = events_for("a0", ["PROPOSE"] * 5) + events_for(
        "a0", ["CRITIQUE"] * 5, start_round=6
    )
    constant = events_for("a1", ["PROPOSE"] * 10)
    both = shifter + constant
    assert context_responsiveness(shifter, ["a0"], total_rounds=10) > 0.9
    assert context_responsiveness(constant, ["a1"], total_rounds=10) < 0.01
    mixed = context_responsiveness(both, ["a0", "a1"], total_rounds=10)
    assert 0.4 < mixed < 0.6


def test_jsd_bounds():
    assert jsd([1.0, 0.0], [0.0, 1.0]) == 1.0
    assert jsd([0.5, 0.5], [0.5, 0.5]) == 0.0


def synthetic_run() -> RunResult:
    """a0 proposes p1; a1 critiques it (c1); a2 modifies p1 into p2
    addressing c1; a0's sim s1 on p1 is used by a1's critique."""
    metas = [
        ProposalMeta(
            proposal_id="p1", author_id="a0", parent_id=None,
            addressed_critique_ids=[], round_created=1, name="g1", objective=0.3,
        ),
        ProposalMeta(
            proposal_id="p2", author_id="a2", parent_id="p1",
            addressed_critique_ids=["c1"], round_created=3, name="g2", objective=0.5,
        ),
    ]
    events = [
        BoardEvent(round=1, agent_id="a0", kind="PROPOSE", artifact_id="p1"),
        BoardEvent(round=1, agent_id="a0", kind="SIMULATE", artifact_id="s1",
                   refs=["p1"]),
        BoardEvent(round=2, agent_id="a1", kind="CRITIQUE", artifact_id="c1",
                   refs=["p1", "s1"]),
        BoardEvent(round=3, agent_id="a2", kind="MODIFY", artifact_id="p2",
                   refs=["p1", "c1"]),
    ]
    return RunResult(
        arm="C", seed=1, n_agents=3,
        final_proposal_id="p2", final_objective=0.5,
        events=events, proposals_meta=metas,
        critique_authors={"c1": "a1"}, sim_authors={"s1": "a0"},
    )


def test_lineage_metrics_on_known_chain():
    m = lineage_metrics(synthetic_run())
    assert m["lineage_depth"] == 2
    assert m["lineage_authors"] == 2      # a2 -> a0
    assert m["cross_modify"] == 1         # a2 modified a0's proposal
    assert m["critique_links"] == 1       # a1's critique consumed by a2
    assert m["sim_reuse"] == 1            # a0's sim used in a1's critique


def test_no_transfer_when_isolated():
    r = synthetic_run()
    # rewrite: every artifact authored and consumed by the same agent
    r.critique_authors = {"c1": "a2"}
    r.sim_authors = {"s1": "a1"}
    for e in r.events:
        e.agent_id = {"p1": "a0", "s1": "a1", "c1": "a1", "p2": "a2"}.get(
            e.artifact_id, e.agent_id
        )
    m = lineage_metrics(r)
    assert m["critique_links"] == 0
    assert m["sim_reuse"] == 0
