"""The closed rule DSL. Every field must be executable by the interpreter."""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class BoardSpec(BaseModel):
    kind: Literal["GRID"] = "GRID"
    width: int = 4
    height: int = 4


class ActionKind(str, Enum):
    PLACE = "PLACE"          # put an own token on an empty cell
    MOVE = "MOVE"            # move an own token up to `distance` (Manhattan)
    CAPTURE = "CAPTURE"      # remove an enemy token meeting `condition`
    TAKE_POOL = "TAKE_POOL"  # take `k` tokens from the shared pool
    PASS = "PASS"            # implicit, always legal


class TurnAction(BaseModel):
    kind: ActionKind
    params: dict[str, int] = Field(default_factory=dict)


class ScoringKind(str, Enum):
    LINE = "LINE"                  # each distinct run >= `length`: `points`
    AREA_MAJORITY = "AREA_MAJORITY"  # at end: majority row/col: `points` each
    CAPTURED = "CAPTURED"          # per captured token: `points`
    POOL_HELD = "POOL_HELD"        # per token in hand: `points`


class ScoringRule(BaseModel):
    kind: ScoringKind
    params: dict[str, int] = Field(default_factory=dict)


class WinKind(str, Enum):
    SCORE_REACH = "SCORE_REACH"    # first to `k` points
    MOST_AT_END = "MOST_AT_END"
    LAST_MOVER = "LAST_MOVER"      # last player to make a non-PASS move


class EndKind(str, Enum):
    ROUNDS = "ROUNDS"              # after `r` rounds
    BOARD_FULL = "BOARD_FULL"
    POOL_EMPTY = "POOL_EMPTY"
    NO_LEGAL_MOVE = "NO_LEGAL_MOVE"


class GameSpec(BaseModel):
    spec_id: str
    name: str
    players_min: int = 2
    players_max: int = 2
    board: BoardSpec = Field(default_factory=BoardSpec)
    tokens_per_player: int = 6
    shared_pool: int = 0
    actions: list[TurnAction] = Field(default_factory=list)
    scoring: list[ScoringRule] = Field(default_factory=list)
    win: WinKind = WinKind.MOST_AT_END
    win_params: dict[str, int] = Field(default_factory=dict)
    end: EndKind = EndKind.ROUNDS
    end_params: dict[str, int] = Field(default_factory=dict)
    est_minutes: float = 0.0           # filled from playouts, never by hand
    design_intent: str = ""            # template text; never used in scoring

    def action_kinds(self) -> set[ActionKind]:
        return {a.kind for a in self.actions}

    def scoring_kinds(self) -> set[ScoringKind]:
        return {s.kind for s in self.scoring}

    def rule_count(self) -> int:
        return len(self.actions) + len(self.scoring)
