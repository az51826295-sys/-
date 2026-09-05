"""Entity factories for Genesis World.

Entity and EntityType are defined in genesis.models.state (so models never
depend on the environment package); this module re-exports them and provides
the canonical constructors used by the map generator and tests.
"""

from __future__ import annotations

from genesis.models.state import Entity, EntityType, Position

__all__ = [
    "Entity",
    "EntityType",
    "Position",
    "make_wall",
    "make_key",
    "make_door",
    "make_button",
    "make_goal",
]


def make_wall(position: Position) -> Entity:
    return Entity(
        entity_id=f"wall-{position.x}-{position.y}",
        entity_type=EntityType.WALL,
        position=position,
        blocking=True,
    )


def make_key(entity_id: str, position: Position) -> Entity:
    return Entity(
        entity_id=entity_id,
        entity_type=EntityType.KEY,
        position=position,
        blocking=False,
    )


def make_door(entity_id: str, position: Position, key_id: str) -> Entity:
    return Entity(
        entity_id=entity_id,
        entity_type=EntityType.DOOR,
        position=position,
        blocking=True,
        locked=True,
        is_open=False,
        key_id=key_id,
    )


def make_button(entity_id: str, position: Position) -> Entity:
    return Entity(
        entity_id=entity_id,
        entity_type=EntityType.BUTTON,
        position=position,
        blocking=False,
        pressed=False,
    )


def make_goal(position: Position, entity_id: str = "goal-1") -> Entity:
    return Entity(
        entity_id=entity_id,
        entity_type=EntityType.GOAL,
        position=position,
        blocking=False,
    )


def make_hazard(entity_id: str, position: Position, direction: str) -> Entity:
    """A patrolling hazard; damages the agent on contact, never blocks."""
    return Entity(
        entity_id=entity_id,
        entity_type=EntityType.HAZARD,
        position=position,
        blocking=False,
        direction=direction,
    )
