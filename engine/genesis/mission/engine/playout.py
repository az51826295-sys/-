"""Run seeded playouts and aggregate the raw metrics (design 5)."""

from __future__ import annotations

import math
import random
from collections import Counter

from genesis.mission.config import MissionConfig
from genesis.mission.engine.interpreter import (
    GameState,
    apply_move,
    legal_moves,
    scores,
)
from genesis.mission.engine.policies import GreedyPolicy, RandomPolicy
from genesis.mission.models.gamespec import GameSpec


class PlayoutStats:
    __slots__ = (
        "turns",
        "winner",
        "terminated",
        "lead_changes",
        "decided_late",
        "comeback",
        "close_decisions",
        "decision_turns",
        "branching_sum",
        "usage",
    )

    def __init__(self):
        self.turns = 0
        self.winner: int | None = None
        self.terminated = False
        self.lead_changes = 0
        self.decided_late = 0.0
        self.comeback = False
        self.close_decisions = 0
        self.decision_turns = 0
        self.branching_sum = 0
        self.usage: Counter = Counter()


def run_playout(
    spec: GameSpec,
    policies: list,
    rng: random.Random,
    config: MissionConfig,
) -> PlayoutStats:
    state = GameState(spec, n_players=len(policies))
    stats = PlayoutStats()
    leaders: list[int | None] = []

    while not state.over and state.turn < config.max_turns:
        moves = legal_moves(spec, state)
        policy = policies[state.current]
        move, values = policy.choose(spec, state, moves, rng)

        non_pass = len(moves) - 1
        stats.branching_sum += len(moves)
        if values and non_pass >= 2:
            stats.decision_turns += 1
            ordered = sorted(values, reverse=True)
            spread = ordered[0] - ordered[-1]
            gap = ordered[0] - ordered[1]
            if spread > 0 and gap <= config.close_gap:
                stats.close_decisions += 1

        apply_move(spec, state, move)
        if move[0] != "PASS":
            stats.usage[move[0]] += 1

        current_scores = scores(spec, state)
        best = max(current_scores)
        tied = [p for p, s in enumerate(current_scores) if s == best]
        leaders.append(tied[0] if len(tied) == 1 else None)

    stats.turns = state.turn
    stats.terminated = state.over
    stats.winner = state.winner if state.over else None

    prev: int | None = None
    for leader in leaders:
        if leader is not None and prev is not None and leader != prev:
            stats.lead_changes += 1
        if leader is not None:
            prev = leader

    if stats.winner is not None and leaders:
        decided_turn = 0
        for i, leader in enumerate(leaders):
            if leader is not None and leader != stats.winner:
                decided_turn = i + 1
        stats.decided_late = decided_turn / len(leaders)
        mid = leaders[len(leaders) // 2] if leaders else None
        stats.comeback = mid is not None and mid != stats.winner
    return stats


def evaluate_spec(spec: GameSpec, config: MissionConfig, seed: int) -> dict[str, float]:
    """The full metric battery. String-derived seeds -> fully reproducible."""
    greedy = GreedyPolicy(depth=2 if config.depth_metric_enabled else 1)
    rand = RandomPolicy()

    skill_wins = 0.0
    for i in range(config.playouts_gvr):
        rng = random.Random(f"{seed}:gvr:{i}")
        greedy_seat = i % 2
        policies = [rand, rand]
        policies[greedy_seat] = greedy
        st = run_playout(spec, policies, rng, config)
        if st.winner == greedy_seat:
            skill_wins += 1
        elif st.winner is None:
            skill_wins += 0.5

    gg: list[PlayoutStats] = []
    for i in range(config.playouts_gvg):
        rng = random.Random(f"{seed}:gvg:{i}")
        gg.append(run_playout(spec, [greedy, GreedyPolicy(depth=greedy.depth)], rng, config))

    n = len(gg)
    turns = [s.turns for s in gg]
    mean_turns = sum(turns) / n
    usage: Counter = Counter()
    for s in gg:
        usage.update(s.usage)
    kinds = [a.kind.value for a in spec.actions]
    if len(kinds) > 1 and sum(usage.values()) > 0:
        total = sum(usage.get(k, 0) for k in kinds)
        entropy = 0.0
        for k in kinds:
            p = usage.get(k, 0) / total if total else 0.0
            if p > 0:
                entropy -= p * math.log(p)
        action_entropy = entropy / math.log(len(kinds))
    else:
        action_entropy = 0.0

    first_wins = sum(1.0 if s.winner == 0 else 0.5 if s.winner is None else 0.0 for s in gg)
    decision_turns = sum(s.decision_turns for s in gg)
    return {
        "termination_rate": sum(1 for s in gg if s.terminated) / n,
        "mean_turns": mean_turns,
        "est_minutes": mean_turns * config.seconds_per_turn / 60.0,
        "draw_rate": sum(1 for s in gg if s.terminated and s.winner is None) / n,
        "branching_mean": sum(s.branching_sum for s in gg) / max(1, sum(turns)),
        "skill_margin": skill_wins / config.playouts_gvr,
        "first_player_adv": first_wins / n,
        "action_entropy": action_entropy,
        "close_decision_rate": (
            sum(s.close_decisions for s in gg) / decision_turns
            if decision_turns
            else 0.0
        ),
        "lead_changes": sum(s.lead_changes for s in gg) / n,
        "decided_late": sum(s.decided_late for s in gg) / n,
        "comeback_rate": sum(1 for s in gg if s.comeback) / n,
    }
