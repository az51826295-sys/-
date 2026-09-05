"""Event log records — the single ledger of facts (design 8.5).

Payloads are plain JSON-serializable dicts; no wall-clock timestamps so
identical runs produce byte-identical logs.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class EventKind(str, Enum):
    SPAWN = "SPAWN"
    DEATH = "DEATH"
    ACTION = "ACTION"
    DAMAGE = "DAMAGE"
    WITNESS = "WITNESS"
    SIGNAL_SENT = "SIGNAL_SENT"
    SIGNAL_HEARD = "SIGNAL_HEARD"
    HYPOTHESIS_CREATED = "HYPOTHESIS_CREATED"
    HYPOTHESIS_UPDATED = "HYPOTHESIS_UPDATED"
    HYPOTHESIS_SPLIT = "HYPOTHESIS_SPLIT"
    HYPOTHESIS_ADOPTED = "HYPOTHESIS_ADOPTED"
    TRUST_CHANGED = "TRUST_CHANGED"
    ENV_CHANGED = "ENV_CHANGED"


class Event(BaseModel):
    tick: int
    agent_id: str | None = None
    kind: EventKind
    payload: dict = Field(default_factory=dict)
