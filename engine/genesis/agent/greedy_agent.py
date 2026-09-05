"""GreedyAgent: a goal-seeking agent that plans over remembered observations.

It never touches world internals. Each step it folds the current
Observation into an internal map (cells within the observation radius),
then plans with BFS over known-passable cells, chasing targets in order:
key -> unpressed button -> closed door (with key) -> goal -> nearest
frontier (a known cell bordering unexplored space). Immediate
opportunities (a key in reach, an openable door ahead, an unpressed
button in reach) are taken before any movement.
"""

from __future__ import annotations

import random
import uuid
from collections import deque

from genesis.environment.rules import forward_position
from genesis.models.action import Action, ActionType
from genesis.models.state import (
    AgentState,
    Entity,
    EntityType,
    Observation,
    Orientation,
)

Cell = tuple[int, int]

_NEIGHBOR_DELTAS = ((0, 1), (0, -1), (1, 0), (-1, 0))
_DELTA_TO_ORIENTATION = {
    orientation.delta: orientation for orientation in Orientation
}


class GreedyAgent:
    def __init__(self, seed: int | None = None, observation_radius: int = 2):
        self._rng = random.Random(seed)
        self._radius = observation_radius
        self._reset_memory("")

    def select_action(self, observation: Observation) -> Action:
        if observation.episode_id != self._episode_id:
            self._reset_memory(observation.episode_id)
        self._update_memory(observation)

        immediate = self._immediate_action(observation)
        if immediate is not None:
            return immediate
        probe = self._exploration_probe(observation)
        if probe is not None:
            return probe
        move = self._planned_move(observation)
        if move is not None:
            return move
        return self._fallback(observation)

    # ------------------------------------------------------------------
    # Memory
    # ------------------------------------------------------------------

    def _reset_memory(self, episode_id: str) -> None:
        self._episode_id = episode_id
        self._known: dict[Cell, str] = {}
        self._doors: dict[Cell, Entity] = {}
        self._keys: dict[str, Cell] = {}
        self._buttons: dict[Cell, bool] = {}
        self._hazards: dict[str, Cell] = {}
        self._hazard_directions: dict[str, str] = {}
        self._goal: Cell | None = None

    def _update_memory(self, observation: Observation) -> None:
        agent = observation.agent_state
        ax, ay = agent.position.x, agent.position.y

        # Everything within the observation radius is now known; cells with
        # no reported entity are free.
        for dx in range(-self._radius, self._radius + 1):
            for dy in range(-self._radius, self._radius + 1):
                if abs(dx) + abs(dy) <= self._radius:
                    self._known.setdefault((ax + dx, ay + dy), "free")

        seen_hazards: dict[str, Cell] = {}
        for entity in observation.visible_entities:
            cell = (entity.position.x, entity.position.y)
            if entity.entity_type == EntityType.WALL:
                self._known[cell] = "wall"
            elif entity.entity_type == EntityType.DOOR:
                self._known[cell] = "door"
                self._doors[cell] = entity
            elif entity.entity_type == EntityType.KEY:
                self._keys[entity.entity_id] = cell
            elif entity.entity_type == EntityType.BUTTON:
                self._buttons[cell] = bool(entity.pressed)
            elif entity.entity_type == EntityType.HAZARD:
                seen_hazards[entity.entity_id] = cell
                if entity.direction:
                    self._hazard_directions[entity.entity_id] = entity.direction
            elif entity.entity_type == EntityType.GOAL:
                self._goal = cell

        # Hazards move: forget remembered positions we can currently see
        # are empty, then record where they actually are.
        for hazard_id, cell in list(self._hazards.items()):
            in_view = (
                abs(cell[0] - ax) + abs(cell[1] - ay) <= self._radius
            )
            if hazard_id not in seen_hazards and in_view:
                del self._hazards[hazard_id]
        self._hazards.update(seen_hazards)

        for key_id in agent.inventory:
            self._keys.pop(key_id, None)

    # ------------------------------------------------------------------
    # Decision making
    # ------------------------------------------------------------------

    def _immediate_action(self, observation: Observation) -> Action | None:
        available = set(observation.available_actions)
        agent = observation.agent_state

        if ActionType.PICK_UP in available:
            return self._action(ActionType.PICK_UP)

        if ActionType.OPEN in available:
            front = forward_position(agent)
            door = next(
                (
                    e
                    for e in observation.visible_entities
                    if e.entity_type == EntityType.DOOR
                    and e.position == front
                ),
                None,
            )
            if (
                door is not None
                and not door.is_open
                and (door.key_id is None or door.key_id in agent.inventory)
            ):
                return self._action(ActionType.OPEN)

        if ActionType.PRESS in available:
            reachable = (agent.position, forward_position(agent))
            if any(
                e.entity_type == EntityType.BUTTON
                and not e.pressed
                and e.position in reachable
                for e in observation.visible_entities
            ):
                return self._action(ActionType.PRESS)

        return None

    def _planned_move(self, observation: Observation) -> Action | None:
        agent = observation.agent_state
        start = (agent.position.x, agent.position.y)
        inventory = agent.inventory

        for targets in self._target_candidates(inventory):
            targets.discard(start)
            if not targets:
                continue
            path = self._bfs(start, targets, inventory)
            if path:
                return self._step_toward(agent, path[0])
        return None

    def _target_candidates(self, inventory: list[str]) -> list[set[Cell]]:
        candidates: list[set[Cell]] = []
        # _update_memory already drops held keys, so every known key is
        # one we still need (chained maps need key-2 while holding key-1)
        if self._keys:
            candidates.append(set(self._keys.values()))
        unpressed = {
            cell for cell, pressed in self._buttons.items() if not pressed
        }
        if unpressed:
            candidates.append(unpressed)
        closed_doors = {
            cell
            for cell, door in self._doors.items()
            if not door.is_open
            and (door.key_id is None or door.key_id in inventory)
        }
        if closed_doors:
            candidates.append(closed_doors)
        if self._goal is not None:
            candidates.append({self._goal})
        frontier = self._frontier(inventory)
        if frontier:
            candidates.append(frontier)
        return candidates

    def _frontier(self, inventory: list[str]) -> set[Cell]:
        return {
            cell
            for cell in self._known
            if self._passable(cell, inventory)
            and any(
                (cell[0] + dx, cell[1] + dy) not in self._known
                for dx, dy in _NEIGHBOR_DELTAS
            )
        }

    def _passable(self, cell: Cell, inventory: list[str]) -> bool:
        info = self._known.get(cell)
        if info is None or info == "wall":
            return False
        if info == "door":
            door = self._doors[cell]
            if door.is_open:
                return True
            return door.key_id is None or door.key_id in inventory
        return True

    def _bfs(
        self, start: Cell, targets: set[Cell], inventory: list[str]
    ) -> list[Cell] | None:
        previous: dict[Cell, Cell | None] = {start: None}
        queue: deque[Cell] = deque([start])
        while queue:
            current = queue.popleft()
            if current in targets:
                path: list[Cell] = []
                while current != start:
                    path.append(current)
                    current = previous[current]  # type: ignore[assignment]
                path.reverse()
                return path
            for dx, dy in _NEIGHBOR_DELTAS:
                neighbor = (current[0] + dx, current[1] + dy)
                if neighbor in previous:
                    continue
                if not self._passable(neighbor, inventory):
                    continue
                previous[neighbor] = current
                queue.append(neighbor)
        return None

    def _step_toward(self, agent: AgentState, next_cell: Cell) -> Action:
        delta = (
            next_cell[0] - agent.position.x,
            next_cell[1] - agent.position.y,
        )
        desired = _DELTA_TO_ORIENTATION[delta]
        if agent.orientation == desired:
            return self._action(ActionType.MOVE_FORWARD)
        if agent.orientation.turned_left() == desired:
            return self._action(ActionType.TURN_LEFT)
        return self._action(ActionType.TURN_RIGHT)

    def _exploration_probe(self, observation: Observation) -> Action | None:
        """Hook for subclasses: return an action to try before planning."""
        return None

    def _fallback(self, observation: Observation) -> Action:
        return self._action(
            self._rng.choice(
                [
                    ActionType.MOVE_FORWARD,
                    ActionType.TURN_LEFT,
                    ActionType.TURN_RIGHT,
                ]
            )
        )

    def _action(self, action_type: ActionType) -> Action:
        return Action(action_id=uuid.uuid4().hex[:12], action_type=action_type)
