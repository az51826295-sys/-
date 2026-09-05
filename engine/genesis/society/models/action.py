"""Actions and their outcomes."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class ActionType(str, Enum):
    MOVE = "MOVE"
    OBSERVE = "OBSERVE"
    EAT = "EAT"
    DRINK = "DRINK"
    PICK_UP = "PICK_UP"
    DROP = "DROP"
    PUSH = "PUSH"
    ATTACK = "ATTACK"
    FLEE = "FLEE"
    WATCH_AGENT = "WATCH_AGENT"
    SIGNAL = "SIGNAL"
    WAIT = "WAIT"


class Action(BaseModel):
    action_type: ActionType
    target_id: str | None = None
    parameters: dict = Field(default_factory=dict)  # e.g. {"dir": "N"}, {"token": 3}


class ActionResult(BaseModel):
    success: bool
    message: str = ""
    # measured internal-state deltas caused directly by this action
    deltas: dict[str, float] = Field(default_factory=dict)


# actions whose outcome nearby agents can witness (design 7)
VISIBLE_OUTCOME_ACTIONS = {
    ActionType.EAT,
    ActionType.DRINK,
    ActionType.ATTACK,
    ActionType.FLEE,
    ActionType.PICK_UP,
    ActionType.PUSH,
    ActionType.SIGNAL,
}
