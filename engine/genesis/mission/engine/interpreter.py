"""GameSpec -> executable state machine (2-player MVP, decision 19).

Moves are plain tuples for speed:
  ("PLACE", x, y) / ("MOVE", x0, y0, x1, y1) / ("CAPTURE", x, y)
  / ("TAKE_POOL",) / ("PASS",)
Scores are stateless functions of the state, recomputed on demand — no
incremental bookkeeping to get wrong.
"""

from __future__ import annotations

from genesis.mission.models.gamespec import (
    ActionKind,
    EndKind,
    GameSpec,
    ScoringKind,
    WinKind,
)

Move = tuple

ORTHO = ((0, 1), (0, -1), (1, 0), (-1, 0))


class GameState:
    __slots__ = (
        "board",
        "hands",
        "captured",
        "pool",
        "turn",
        "current",
        "last_mover",
        "pass_streak",
        "over",
        "winner",
    )

    def __init__(self, spec: GameSpec, n_players: int = 2):
        self.board: dict[tuple[int, int], int] = {}
        self.hands = [spec.tokens_per_player] * n_players
        self.captured = [0] * n_players
        self.pool = spec.shared_pool
        self.turn = 0
        self.current = 0
        self.last_mover: int | None = None
        self.pass_streak = 0
        self.over = False
        self.winner: int | None = None

    @property
    def n_players(self) -> int:
        return len(self.hands)

    def clone(self) -> "GameState":
        c = object.__new__(GameState)
        c.board = dict(self.board)
        c.hands = list(self.hands)
        c.captured = list(self.captured)
        c.pool = self.pool
        c.turn = self.turn
        c.current = self.current
        c.last_mover = self.last_mover
        c.pass_streak = self.pass_streak
        c.over = self.over
        c.winner = self.winner
        return c


# -------------------------------------------------------------------- scoring


def _line_count(spec: GameSpec, state: GameState, player: int, length: int) -> int:
    w, h = spec.board.width, spec.board.height
    count = 0
    for dx, dy in ((1, 0), (0, 1), (1, 1), (1, -1)):
        for y in range(h):
            for x in range(w):
                px, py = x - dx, y - dy  # only count run starts (maximal runs)
                if (
                    0 <= px < w
                    and 0 <= py < h
                    and state.board.get((px, py)) == player
                ):
                    continue
                run = 0
                cx, cy = x, y
                while 0 <= cx < w and 0 <= cy < h and state.board.get((cx, cy)) == player:
                    run += 1
                    cx += dx
                    cy += dy
                if run >= length:
                    count += 1
    return count


def _majority_count(spec: GameSpec, state: GameState, player: int) -> int:
    w, h = spec.board.width, spec.board.height
    n = state.n_players
    count = 0
    for y in range(h):
        tally = [0] * n
        for x in range(w):
            p = state.board.get((x, y))
            if p is not None:
                tally[p] += 1
        if tally[player] > 0 and all(
            tally[player] > tally[q] for q in range(n) if q != player
        ):
            count += 1
    for x in range(w):
        tally = [0] * n
        for y in range(h):
            p = state.board.get((x, y))
            if p is not None:
                tally[p] += 1
        if tally[player] > 0 and all(
            tally[player] > tally[q] for q in range(n) if q != player
        ):
            count += 1
    return count


def score(spec: GameSpec, state: GameState, player: int) -> int:
    total = 0
    for rule in spec.scoring:
        points = rule.params.get("points", 1)
        if rule.kind == ScoringKind.LINE:
            total += points * _line_count(
                spec, state, player, rule.params.get("length", 3)
            )
        elif rule.kind == ScoringKind.AREA_MAJORITY:
            total += points * _majority_count(spec, state, player)
        elif rule.kind == ScoringKind.CAPTURED:
            total += points * state.captured[player]
        elif rule.kind == ScoringKind.POOL_HELD:
            total += points * state.hands[player]
    return total


def scores(spec: GameSpec, state: GameState) -> list[int]:
    return [score(spec, state, p) for p in range(state.n_players)]


# ---------------------------------------------------------------- legal moves


def legal_moves(spec: GameSpec, state: GameState) -> list[Move]:
    p = state.current
    w, h = spec.board.width, spec.board.height
    moves: list[Move] = []
    for action in spec.actions:
        if action.kind == ActionKind.PLACE and state.hands[p] > 0:
            for y in range(h):
                for x in range(w):
                    if (x, y) not in state.board:
                        moves.append(("PLACE", x, y))
        elif action.kind == ActionKind.MOVE:
            d = action.params.get("distance", 1)
            own = [pos for pos, owner in state.board.items() if owner == p]
            for x0, y0 in own:
                for x1 in range(max(0, x0 - d), min(w, x0 + d + 1)):
                    for y1 in range(max(0, y0 - d), min(h, y0 + d + 1)):
                        if (
                            0 < abs(x1 - x0) + abs(y1 - y0) <= d
                            and (x1, y1) not in state.board
                        ):
                            moves.append(("MOVE", x0, y0, x1, y1))
        elif action.kind == ActionKind.CAPTURE:
            flanked = bool(action.params.get("flanked", 0))
            for (x, y), owner in state.board.items():
                if owner == p:
                    continue
                if flanked:
                    for dx, dy in ((1, 0), (0, 1)):
                        a = state.board.get((x - dx, y - dy))
                        b = state.board.get((x + dx, y + dy))
                        if a == p and b == p:
                            moves.append(("CAPTURE", x, y))
                            break
                else:
                    if any(
                        state.board.get((x + dx, y + dy)) == p for dx, dy in ORTHO
                    ):
                        moves.append(("CAPTURE", x, y))
        elif action.kind == ActionKind.TAKE_POOL and state.pool > 0:
            moves.append(("TAKE_POOL",))
    moves.append(("PASS",))
    return moves


# -------------------------------------------------------------------- applying


def apply_move(spec: GameSpec, state: GameState, move: Move) -> None:
    p = state.current
    kind = move[0]
    if kind == "PLACE":
        state.board[(move[1], move[2])] = p
        state.hands[p] -= 1
    elif kind == "MOVE":
        del state.board[(move[1], move[2])]
        state.board[(move[3], move[4])] = p
    elif kind == "CAPTURE":
        del state.board[(move[1], move[2])]
        state.captured[p] += 1
    elif kind == "TAKE_POOL":
        k = 1
        for a in spec.actions:
            if a.kind == ActionKind.TAKE_POOL:
                k = a.params.get("k", 1)
        take = min(k, state.pool)
        state.pool -= take
        state.hands[p] += take

    if kind != "PASS":
        state.last_mover = p
        state.pass_streak = 0
    else:
        state.pass_streak += 1

    state.turn += 1

    if spec.win == WinKind.SCORE_REACH and kind != "PASS":
        if score(spec, state, p) >= spec.win_params.get("k", 99):
            state.over = True
            state.winner = p
            return

    ended = False
    if state.pass_streak >= state.n_players:  # global stalemate safety net
        ended = True
    elif spec.end == EndKind.ROUNDS:
        if state.turn >= spec.end_params.get("r", 10) * state.n_players:
            ended = True
    elif spec.end == EndKind.BOARD_FULL:
        if len(state.board) >= spec.board.width * spec.board.height:
            ended = True
    elif spec.end == EndKind.POOL_EMPTY:
        if state.pool <= 0:
            ended = True

    state.current = (state.current + 1) % state.n_players

    if not ended and spec.end == EndKind.NO_LEGAL_MOVE:
        nxt = legal_moves(spec, state)
        if len(nxt) == 1:  # only PASS
            ended = True

    if ended:
        state.over = True
        if spec.win == WinKind.MOST_AT_END:
            final = scores(spec, state)
            best = max(final)
            leaders = [q for q, s in enumerate(final) if s == best]
            state.winner = leaders[0] if len(leaders) == 1 else None
        elif spec.win == WinKind.LAST_MOVER:
            state.winner = state.last_mover
        else:  # SCORE_REACH ended without anyone reaching k
            state.winner = None
