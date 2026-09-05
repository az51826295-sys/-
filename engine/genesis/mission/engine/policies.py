"""Virtual players. Deliberately shallow: a smarter engine would make the
metrics measure the policy instead of the game (design premise 1)."""

from __future__ import annotations

import random

from genesis.mission.engine.interpreter import (
    GameState,
    Move,
    apply_move,
    score,
)
from genesis.mission.models.gamespec import GameSpec


class RandomPolicy:
    name = "random"

    def choose(
        self, spec: GameSpec, state: GameState, moves: list[Move], rng: random.Random
    ) -> tuple[Move, list[float]]:
        return moves[rng.randrange(len(moves))], []


class GreedyPolicy:
    """Maximize own immediate score delta; optional 2-ply for depth metric."""

    def __init__(self, depth: int = 1):
        self.depth = depth
        self.name = f"greedy{depth}"

    def _value(
        self, spec: GameSpec, state: GameState, move: Move, base: float
    ) -> float:
        p = state.current
        after = state.clone()
        apply_move(spec, after, move)
        v = float(score(spec, after, p)) - base
        if move[0] == "PASS":
            v -= 0.01  # prefer doing something over nothing at equal value
        if self.depth >= 2 and not after.over:
            from genesis.mission.engine.interpreter import legal_moves

            opp = after.current
            best_reply = 0.0
            for reply in legal_moves(spec, after):
                reply_state = after.clone()
                apply_move(spec, reply_state, reply)
                gain = float(score(spec, reply_state, opp) - score(spec, after, opp))
                best_reply = max(best_reply, gain)
            v -= 0.5 * best_reply
        return v

    def choose(
        self, spec: GameSpec, state: GameState, moves: list[Move], rng: random.Random
    ) -> tuple[Move, list[float]]:
        base = float(score(spec, state, state.current))
        values = [self._value(spec, state, m, base) for m in moves]
        best = max(values)
        top = [m for m, v in zip(moves, values) if v == best]
        return top[rng.randrange(len(top))], values
