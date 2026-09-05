"""Agent-side data: internal state and immutable traits."""

from __future__ import annotations

from pydantic import BaseModel, Field

from genesis.society.models.core import Position
from genesis.society.models.world import Resource


class InternalState(BaseModel):
    energy: float = 100.0
    hydration: float = 100.0
    health: float = 100.0
    age: int = 0
    fear: float = 0.0
    curiosity_state: float = 0.0


class Traits(BaseModel):
    """Set at birth from the spawn RNG, immutable afterwards."""

    curiosity: float
    risk_aversion: float
    memory_capacity: int
    observation_accuracy: float
    imitation_tendency: float
    planning_horizon: int = 1
    social_trust_bias: float


class Agent(BaseModel):
    agent_id: str
    born_tick: int
    position: Position
    state: InternalState = Field(default_factory=InternalState)
    traits: Traits
    inventory: list[Resource] = Field(default_factory=list)
    alive: bool = True
    # transient perception modifiers, consumed at next perception phase
    focus: bool = False               # set by OBSERVE
    watching: str | None = None       # set by WATCH_AGENT
