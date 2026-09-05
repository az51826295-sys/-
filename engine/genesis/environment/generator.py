"""Deterministic, always-solvable map generation for Genesis World.

Layout: outer boundary walls plus `num_door_sections` vertical dividing
walls, each with a single locked door. Key i sits in region i (left of
door i), so the map must be solved as a chain:
key-1 -> door-1 -> key-2 -> door-2 -> ... -> goal (rightmost region).
The agent and the button start in the leftmost region.

Extra obstacle walls are only kept if a staged BFS check confirms the
chain stays solvable: key i must be reachable with doors i..n still
closed, the button with all doors closed, and the goal with all doors
open. Hazards (if configured) patrol vertically, never block movement,
and are placed away from the agent's starting position.
"""

from __future__ import annotations

import random
from collections import deque

from genesis.config import GenesisConfig
from genesis.environment.entities import (
    Entity,
    make_button,
    make_door,
    make_goal,
    make_hazard,
    make_key,
    make_wall,
)
from genesis.models.state import AgentState, EntityType, Orientation, Position

BUTTON_ID = "button-1"


def generate_map(
    config: GenesisConfig, rng: random.Random
) -> tuple[dict[str, Entity], AgentState]:
    width, height = config.width, config.height
    sections = max(1, config.num_door_sections)
    entities: dict[str, Entity] = {}

    def add(entity: Entity) -> None:
        entities[entity.entity_id] = entity

    # Boundary walls
    for x in range(width):
        add(make_wall(Position(x=x, y=0)))
        add(make_wall(Position(x=x, y=height - 1)))
    for y in range(1, height - 1):
        add(make_wall(Position(x=0, y=y)))
        add(make_wall(Position(x=width - 1, y=y)))

    # Dividing walls, one locked door each
    wall_xs = [
        round(width * (i + 1) / (sections + 1)) for i in range(sections)
    ]
    for i, wall_x in enumerate(wall_xs):
        door_y = rng.randint(2, height - 3)
        for y in range(1, height - 1):
            if y != door_y:
                add(make_wall(Position(x=wall_x, y=y)))
        add(
            make_door(
                f"door-{i + 1}",
                Position(x=wall_x, y=door_y),
                key_id=f"key-{i + 1}",
            )
        )

    # Regions between the dividing walls, left to right
    bounds = [0] + wall_xs + [width - 1]
    regions: list[list[Position]] = []
    for i in range(len(bounds) - 1):
        regions.append(
            [
                Position(x=x, y=y)
                for x in range(bounds[i] + 1, bounds[i + 1])
                for y in range(1, height - 1)
            ]
        )

    def take(cells: list[Position]) -> Position:
        pos = rng.choice(cells)
        cells.remove(pos)
        return pos

    agent_pos = take(regions[0])
    key_positions = []
    for i in range(sections):
        key_pos = take(regions[i])
        key_positions.append(key_pos)
        add(make_key(f"key-{i + 1}", key_pos))
    button_pos = take(regions[0])
    add(make_button(BUTTON_ID, button_pos))
    goal_pos = take(regions[-1])
    add(make_goal(goal_pos))

    def solvable() -> bool:
        return _staged_solvable(
            entities, agent_pos, key_positions, button_pos, goal_pos,
            width, height,
        )

    # Extra obstacles, kept only if the chain stays solvable
    obstacle_candidates = [cell for region in regions for cell in region]
    n_obstacles = rng.randint(2, 4)
    placed = 0
    attempts = 0
    while placed < n_obstacles and attempts < 20 and obstacle_candidates:
        attempts += 1
        pos = rng.choice(obstacle_candidates)
        obstacle_candidates.remove(pos)
        wall = make_wall(pos)
        entities[wall.entity_id] = wall
        if solvable():
            placed += 1
        else:
            del entities[wall.entity_id]

    # Patrolling hazards, away from the agent's start
    hazard_candidates = [
        cell
        for cell in obstacle_candidates
        if cell.manhattan_distance(agent_pos) > 2
    ]
    for i in range(config.num_hazards):
        if not hazard_candidates:
            break
        pos = rng.choice(hazard_candidates)
        hazard_candidates.remove(pos)
        add(
            make_hazard(
                f"hazard-{i + 1}",
                pos,
                direction=rng.choice(["NORTH", "SOUTH"]),
            )
        )

    agent = AgentState(
        position=agent_pos,
        orientation=rng.choice(list(Orientation)),
        inventory=[],
        energy=config.initial_energy,
        step_count=0,
    )
    return entities, agent


def _staged_solvable(
    entities: dict[str, Entity],
    agent_pos: Position,
    key_positions: list[Position],
    button_pos: Position,
    goal_pos: Position,
    width: int,
    height: int,
) -> bool:
    walls = {
        (e.position.x, e.position.y)
        for e in entities.values()
        if e.blocking and e.entity_type == EntityType.WALL
    }
    door_cells = [
        (d.position.x, d.position.y)
        for d in sorted(
            (
                e
                for e in entities.values()
                if e.entity_type == EntityType.DOOR
            ),
            key=lambda d: d.position.x,
        )
    ]

    # Key i needs to be reachable while doors i..n are still closed
    for i, key_pos in enumerate(key_positions):
        blocked = walls | set(door_cells[i:])
        if not _reaches(blocked, agent_pos, key_pos, width, height):
            return False
    # Button: leftmost region, so all doors may be closed
    if not _reaches(
        walls | set(door_cells), agent_pos, button_pos, width, height
    ):
        return False
    # Goal: reachable once every door is open
    return _reaches(walls, agent_pos, goal_pos, width, height)


def _reaches(
    blocked: set[tuple[int, int]],
    start: Position,
    target: Position,
    width: int,
    height: int,
) -> bool:
    if (target.x, target.y) in blocked:
        return False
    frontier = deque([(start.x, start.y)])
    seen = {(start.x, start.y)}
    while frontier:
        x, y = frontier.popleft()
        if (x, y) == (target.x, target.y):
            return True
        for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < width and 0 <= ny < height):
                continue
            if (nx, ny) in blocked or (nx, ny) in seen:
                continue
            seen.add((nx, ny))
            frontier.append((nx, ny))
    return False
