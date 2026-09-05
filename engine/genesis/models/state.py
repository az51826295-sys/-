"""Core state models: positions, orientations, entities, agent state, observations.

Entity/EntityType live here (rather than in genesis.environment) so that the
dependency direction stays one-way: environment -> models, never the reverse.
genesis.environment.entities re-exports them alongside factory helpers.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from genesis.models.action import ActionResult, ActionType


class Position(BaseModel):
    model_config = ConfigDict(frozen=True)

    x: int
    y: int

    def manhattan_distance(self, other: "Position") -> int:
        return abs(self.x - other.x) + abs(self.y - other.y)


class Orientation(str, Enum):
    NORTH = "NORTH"
    EAST = "EAST"
    SOUTH = "SOUTH"
    WEST = "WEST"

    @property
    def delta(self) -> tuple[int, int]:
        """Unit step (dx, dy) for this facing. y grows downward (row order)."""
        return _DELTAS[self]

    def turned_left(self) -> "Orientation":
        order = _CLOCKWISE
        return order[(order.index(self) - 1) % 4]

    def turned_right(self) -> "Orientation":
        order = _CLOCKWISE
        return order[(order.index(self) + 1) % 4]


_CLOCKWISE = [Orientation.NORTH, Orientation.EAST, Orientation.SOUTH, Orientation.WEST]
_DELTAS = {
    Orientation.NORTH: (0, -1),
    Orientation.EAST: (1, 0),
    Orientation.SOUTH: (0, 1),
    Orientation.WEST: (-1, 0),
}


class EntityType(str, Enum):
    AGENT = "AGENT"
    WALL = "WALL"
    KEY = "KEY"
    DOOR = "DOOR"
    BUTTON = "BUTTON"
    GOAL = "GOAL"
    BOX = "BOX"
    HAZARD = "HAZARD"


class Entity(BaseModel):
    entity_id: str
    entity_type: EntityType
    position: Position
    visible: bool = True
    blocking: bool = False

    # Type-specific optional attributes
    locked: bool | None = None  # DOOR
    is_open: bool | None = None  # DOOR
    key_id: str | None = None  # DOOR: which key opens it
    pressed: bool | None = None  # BUTTON
    direction: str | None = None  # HAZARD: patrol heading (Orientation value)


class AgentState(BaseModel):
    position: Position
    orientation: Orientation
    inventory: list[str] = Field(default_factory=list)
    energy: int
    step_count: int = 0


class Observation(BaseModel):
    """What the agent is allowed to see. Never the full world state.

    visible_entities only contains entities within the observation radius
    (Manhattan distance) around the agent.
    """

    episode_id: str
    step: int
    agent_state: AgentState
    visible_entities: list[Entity] = Field(default_factory=list)
    available_actions: list[ActionType] = Field(default_factory=list)
    last_action_result: ActionResult | None = None
    terminal: bool = False
    success: bool = False
