"""Action models: what the agent can do and what came of it."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class ActionType(str, Enum):
    MOVE_FORWARD = "MOVE_FORWARD"
    TURN_LEFT = "TURN_LEFT"
    TURN_RIGHT = "TURN_RIGHT"
    OBSERVE = "OBSERVE"
    PICK_UP = "PICK_UP"
    DROP = "DROP"
    USE = "USE"
    OPEN = "OPEN"
    PRESS = "PRESS"
    WAIT = "WAIT"


class Action(BaseModel):
    action_id: str
    action_type: ActionType
    target_id: str | None = None
    parameters: dict = Field(default_factory=dict)


class ActionResult(BaseModel):
    success: bool
    message: str = ""
    state_changed: bool = False
    reward: float = 0.0
    terminal: bool = False
    metadata: dict = Field(default_factory=dict)
