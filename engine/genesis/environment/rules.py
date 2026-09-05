"""Pure helper rules shared by the world and the naive world model."""

from __future__ import annotations

from genesis.models.state import AgentState, Entity, Position


def forward_position(agent: AgentState) -> Position:
    dx, dy = agent.orientation.delta
    return Position(x=agent.position.x + dx, y=agent.position.y + dy)


def entities_at(
    entities: dict[str, Entity] | list[Entity],
    position: Position,
    visible_only: bool = True,
) -> list[Entity]:
    values = entities.values() if isinstance(entities, dict) else entities
    return [
        e
        for e in values
        if e.position == position and (e.visible or not visible_only)
    ]


def blocking_entity_at(
    entities: dict[str, Entity] | list[Entity], position: Position
) -> Entity | None:
    for entity in entities_at(entities, position):
        if entity.blocking:
            return entity
    return None
