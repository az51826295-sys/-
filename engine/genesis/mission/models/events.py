"""The behavior log — sole input of the role/lineage analysis."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

EventKindT = Literal[
    "PROPOSE", "MODIFY", "CRITIQUE", "SIMULATE", "ENDORSE", "OPPOSE", "SELECT"
]

ACTION_KINDS: tuple[str, ...] = ("PROPOSE", "MODIFY", "CRITIQUE", "SIMULATE")


class BoardEvent(BaseModel):
    round: int
    agent_id: str
    kind: EventKindT
    artifact_id: str = ""
    refs: list[str] = Field(default_factory=list)
    utilities: dict[str, float] = Field(default_factory=dict)
