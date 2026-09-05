"""World-side data: terrain, resources, cells, and their perceived views."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field

from genesis.society.models.core import Position


class TerrainType(str, Enum):
    PLAIN = "PLAIN"
    WATER = "WATER"
    BLOCKED = "BLOCKED"


class ResourceType(str, Enum):
    FOOD = "FOOD"
    STONE = "STONE"
    WOOD = "WOOD"


class Resource(BaseModel):
    resource_id: str
    resource_type: ResourceType
    features: dict[str, str] = Field(default_factory=dict)
    energy_value: float = 0.0     # hidden from agents; FOOD only
    portable: bool = True


class Cell(BaseModel):
    terrain: TerrainType = TerrainType.PLAIN
    resources: list[Resource] = Field(default_factory=list)
    hazard: bool = False
    occupant_id: str | None = None
    dried: bool = False           # WATER cell dried by winter

    @property
    def walkable(self) -> bool:
        if self.terrain == TerrainType.BLOCKED:
            return False
        if self.terrain == TerrainType.WATER and not self.dried:
            return False
        return True

    @property
    def drinkable(self) -> bool:
        return self.terrain == TerrainType.WATER and not self.dried


class ResourceView(BaseModel):
    """A resource as perceived: no hidden values, features possibly wrong."""

    resource_id: str
    resource_type: ResourceType
    features: dict[str, str] = Field(default_factory=dict)
    portable: bool = True


class CellView(BaseModel):
    """A cell as perceived, keyed by offset relative to the observer.

    Absolute coordinates never appear on the agent path (design 0).
    """

    dx: int
    dy: int
    terrain: TerrainType
    hazard: bool
    drinkable: bool
    resources: list[ResourceView] = Field(default_factory=list)
    occupant_id: str | None = None


__all__ = [
    "TerrainType",
    "ResourceType",
    "Resource",
    "Cell",
    "ResourceView",
    "CellView",
    "Position",
]
