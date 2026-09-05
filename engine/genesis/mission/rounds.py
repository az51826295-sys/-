"""Arm runners A/B/C with a shared, budget-equal protocol (design 3, 9).

A: one agent, N*T solo actions.  B: N isolated islands, T rounds.
C: N agents, one shared blackboard, T rounds.
Judging (post-hoc, outside budget, identical for every arm): every
proposal is evaluated with the same judge seed and the fixed objective.
"""

from __future__ import annotations

import math
import random

from pydantic import BaseModel, Field

from genesis.mission.agents.agent import MissionAgent
from genesis.mission.board import Blackboard
from genesis.mission.config import MissionConfig
from genesis.mission.engine.playout import evaluate_spec
from genesis.mission.engine.static_check import static_issues
from genesis.mission.evaluation.score import objective
from genesis.mission.models import AgentTraits, BoardEvent, sample_traits


class ProposalMeta(BaseModel):
    proposal_id: str
    author_id: str
    parent_id: str | None
    addressed_critique_ids: list[str]
    round_created: int
    name: str
    objective: float


class RunResult(BaseModel):
    arm: str
    seed: int
    n_agents: int
    final_proposal_id: str | None
    final_name: str = ""
    final_spec_json: str = ""
    final_objective: float = 0.0
    initial_best: float = 0.0
    improvement: float = 0.0
    n_proposals: int = 0
    counterfactual_differs: bool = False
    removed: list[str] = Field(default_factory=list)
    events: list[BoardEvent] = Field(default_factory=list)
    proposals_meta: list[ProposalMeta] = Field(default_factory=list)
    critique_authors: dict[str, str] = Field(default_factory=dict)
    sim_authors: dict[str, str] = Field(default_factory=dict)


def run_arm(
    arm: str,
    config: MissionConfig,
    seed: int,
    removal: bool = False,
    collect: dict | None = None,
) -> RunResult:
    """collect가 주어지면 관찰 전용 자료를 담는다 (2개월차 장부
    표 작성용): proposals = {pid: spec_json}, boards = {pid: 그
    제안이 오른 보드의 주인 agent_id 목록}. rng를 소비하지 않고
    실행 경로를 바꾸지 않는다 - 재실행 충실도 16/16이 이 인자
    추가 후에도 유지됨을 tools/replay_fidelity.py로 재검증한다."""
    assert arm in ("A", "B", "C")
    run_tag = f"{arm}:{seed}"
    trait_rng = random.Random(f"{seed}:traits")
    all_traits: list[AgentTraits] = [
        sample_traits(trait_rng, config) for _ in range(config.n_agents)
    ]
    arb = random.Random(f"{run_tag}:arb")

    if arm == "A":
        agent_ids = ["a0"]
    else:
        agent_ids = [f"a{i}" for i in range(config.n_agents)]
    agents = {
        aid: MissionAgent(
            aid,
            all_traits[i],
            random.Random(f"{run_tag}:agent:{i}"),
            config,
            run_tag,
        )
        for i, aid in enumerate(agent_ids)
    }

    if arm == "B":
        boards = {aid: Blackboard() for aid in agent_ids}
    else:
        shared = Blackboard()
        boards = {aid: shared for aid in agent_ids}

    removed: list[str] = []
    total_rounds = config.n_rounds * config.n_agents if arm == "A" else config.n_rounds
    removal_round = math.ceil(total_rounds * config.removal_round_fraction)

    for rnd in range(1, total_rounds + 1):
        if removal and arm == "C" and rnd == removal_round:
            removed = sorted(arb.sample(agent_ids, config.removal_count))
            for aid in removed:
                agents[aid].active = False
        order = list(agent_ids)
        arb.shuffle(order)
        for aid in order:
            if agents[aid].active:
                agents[aid].act(boards[aid], rnd)

    vote_round = total_rounds + 1
    for aid in agent_ids:
        if agents[aid].active:
            agents[aid].vote(boards[aid], vote_round)

    # ---- judging pass: identical battery for every arm, outside budget ----
    judge_cache: dict[str, tuple[float, dict]] = {}
    all_proposals = {}
    for board in set(boards.values()):
        all_proposals.update(board.proposals)

    metas: list[ProposalMeta] = []
    for pid in sorted(all_proposals):
        proposal = all_proposals[pid]
        key = proposal.spec.model_copy(
            update={"spec_id": "", "name": "", "design_intent": ""}
        ).model_dump_json()
        if key in judge_cache:
            obj, _ = judge_cache[key]
        else:
            issues = static_issues(proposal.spec)
            metrics = evaluate_spec(proposal.spec, config, f"judge:{seed}")
            obj = objective(proposal.spec, metrics, issues, config)
            judge_cache[key] = (obj, metrics)
        metas.append(
            ProposalMeta(
                proposal_id=pid,
                author_id=proposal.author_id,
                parent_id=proposal.parent_id,
                addressed_critique_ids=proposal.addressed_critique_ids,
                round_created=proposal.round_created,
                name=proposal.spec.name,
                objective=obj,
            )
        )

    result = RunResult(
        arm=arm, seed=seed, n_agents=config.n_agents,
        final_proposal_id=None, removed=removed,
    )
    result.n_proposals = len(metas)
    for board in set(boards.values()):
        result.events.extend(board.events)
        for c in board.critiques.values():
            result.critique_authors[c.critique_id] = c.author_id
        for s in board.sims.values():
            result.sim_authors[s.result_id] = s.author_id

    if metas:
        best = max(metas, key=lambda m: (m.objective, m.proposal_id))
        result.final_proposal_id = best.proposal_id
        result.final_name = best.name
        result.final_objective = best.objective
        result.final_spec_json = all_proposals[best.proposal_id].spec.model_dump_json()

        initial_limit = config.n_agents if arm != "A" else config.n_agents
        initial = [
            m.objective
            for m in metas
            if (m.round_created == 1 if arm != "A" else m.round_created <= initial_limit)
        ]
        result.initial_best = max(initial, default=0.0)
        result.improvement = result.final_objective - result.initial_best

        if arm == "C":
            board = next(iter(set(boards.values())))
            net: dict[str, int] = {}
            for e in board.endorsements:
                net[e.proposal_id] = net.get(e.proposal_id, 0) + (
                    1 if e.stance == "SUPPORT" else -1
                )
            voted = max(
                metas,
                key=lambda m: (
                    m.objective + 0.2 * net.get(m.proposal_id, 0) / config.n_agents,
                    m.proposal_id,
                ),
            )
            result.counterfactual_differs = voted.proposal_id != best.proposal_id

    result.proposals_meta = metas
    if collect is not None:
        collect["proposals"] = {
            pid: p.spec.model_dump_json()
            for pid, p in all_proposals.items()}
        owners: dict[str, list[str]] = {}
        for aid, board in boards.items():
            for pid in board.proposals:
                owners.setdefault(pid, []).append(aid)
        collect["board_owners"] = owners
    return result
