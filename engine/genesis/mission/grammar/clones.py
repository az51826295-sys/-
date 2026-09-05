"""Forbidden-game detection.

Rock-paper-scissors is unrepresentable by construction (the DSL has no
simultaneous reveal), so only the tic-tac-toe family needs a gate.
"""

from __future__ import annotations

from genesis.mission.models.gamespec import (
    ActionKind,
    GameSpec,
    ScoringKind,
    WinKind,
)


def is_clone(spec: GameSpec) -> str | None:
    """Return a reason string if the spec replicates a forbidden game."""
    if (
        spec.board.width == 3
        and spec.board.height == 3
        and spec.action_kinds() == {ActionKind.PLACE}
    ):
        for rule in spec.scoring:
            if (
                rule.kind == ScoringKind.LINE
                and rule.params.get("length", 0) == 3
                and spec.win == WinKind.SCORE_REACH
                and spec.win_params.get("k", 99) <= rule.params.get("points", 1)
            ):
                return "tic-tac-toe: 3x3, place-only, first line of 3 wins"
    return None
