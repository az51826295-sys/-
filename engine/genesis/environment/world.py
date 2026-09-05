"""GenesisWorld: the grid environment the agent lives in.

The agent only ever receives Observation objects (limited to the observation
radius); the full internal state is exposed only through debug helpers that
must not be used on the agent execution path.
"""

from __future__ import annotations

import random
import uuid

from genesis.config import GenesisConfig
from genesis.environment.generator import generate_map
from genesis.environment.rules import (
    blocking_entity_at,
    entities_at,
    forward_position,
)
from genesis.models.action import Action, ActionResult, ActionType
from genesis.models.state import (
    AgentState,
    Entity,
    EntityType,
    Observation,
    Position,
)

_RENDER_SYMBOLS = {
    EntityType.WALL: "#",
    EntityType.KEY: "K",
    EntityType.BUTTON: "B",
    EntityType.GOAL: "G",
    EntityType.BOX: "X",
    EntityType.HAZARD: "H",
}
_AGENT_ARROWS = {"NORTH": "^", "EAST": ">", "SOUTH": "v", "WEST": "<"}
_OPPOSITE = {"NORTH": "SOUTH", "SOUTH": "NORTH", "EAST": "WEST", "WEST": "EAST"}


class GenesisWorld:
    def __init__(self, config: GenesisConfig | None = None):
        self.config = config or GenesisConfig()
        self._entities: dict[str, Entity] = {}
        self._agent: AgentState | None = None
        self._episode_id: str = ""
        self._terminal: bool = False
        self._success: bool = False
        self._terminal_reason: str | None = None
        self._last_result: ActionResult | None = None
        self._rng = random.Random(0)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def episode_id(self) -> str:
        return self._episode_id

    @property
    def success(self) -> bool:
        return self._success

    @property
    def terminal_reason(self) -> str | None:
        return self._terminal_reason

    def reset(self, seed: int | None = None) -> Observation:
        rng = random.Random(seed)
        self._entities, self._agent = generate_map(self.config, rng)
        # Continue the same seeded stream for in-episode stochasticity
        # (slips), so a seed reproduces the entire episode.
        self._rng = rng
        self._episode_id = uuid.uuid4().hex[:12]
        self._terminal = False
        self._success = False
        self._terminal_reason = None
        self._last_result = None
        return self.observe()

    def observe(self) -> Observation:
        agent = self._require_agent()
        visible = [
            entity.model_copy(deep=True)
            for entity in self._entities.values()
            if entity.visible
            and entity.position.manhattan_distance(agent.position)
            <= self.config.observation_radius
        ]
        return Observation(
            episode_id=self._episode_id,
            step=agent.step_count,
            agent_state=agent.model_copy(deep=True),
            visible_entities=visible,
            available_actions=self._available_actions(),
            last_action_result=(
                self._last_result.model_copy(deep=True)
                if self._last_result
                else None
            ),
            terminal=self._terminal,
            success=self._success,
        )

    def step(self, action: Action) -> tuple[Observation, ActionResult]:
        agent = self._require_agent()
        if self._terminal:
            result = ActionResult(
                success=False, message="episode already ended", terminal=True
            )
            self._last_result = result
            return self.observe(), result

        handler = {
            ActionType.MOVE_FORWARD: self._handle_move,
            ActionType.TURN_LEFT: self._handle_turn_left,
            ActionType.TURN_RIGHT: self._handle_turn_right,
            ActionType.OBSERVE: self._handle_noop,
            ActionType.PICK_UP: self._handle_pick_up,
            ActionType.DROP: self._handle_drop,
            ActionType.USE: self._handle_open,
            ActionType.OPEN: self._handle_open,
            ActionType.PRESS: self._handle_press,
            ActionType.WAIT: self._handle_noop,
        }[action.action_type]
        result = handler(action)
        result.reward += self.config.step_reward

        if not self._terminal:
            self._move_hazards()
            hits = sum(
                1
                for e in self._entities.values()
                if e.entity_type == EntityType.HAZARD
                and e.visible
                and e.position == agent.position
            )
            if hits:
                agent.energy -= hits * self.config.hazard_energy_damage
                result.reward += hits * self.config.hazard_reward_penalty
                result.metadata["hazard_hits"] = hits

        agent.energy -= 1
        agent.step_count += 1

        if not self._terminal:
            if agent.energy <= 0:
                self._end_episode(success=False, reason="energy_depleted")
            elif agent.step_count >= self.config.max_steps:
                self._end_episode(success=False, reason="max_steps")
        if self._terminal:
            result.terminal = True

        self._last_result = result
        return self.observe(), result

    def is_terminal(self) -> bool:
        return self._terminal

    def render_text(self) -> str:
        agent = self._require_agent()
        grid = [
            ["." for _ in range(self.config.width)]
            for _ in range(self.config.height)
        ]
        for entity in self._entities.values():
            if not entity.visible:
                continue
            if entity.entity_type == EntityType.DOOR:
                symbol = "/" if entity.is_open else "D"
            else:
                symbol = _RENDER_SYMBOLS.get(entity.entity_type, "?")
            grid[entity.position.y][entity.position.x] = symbol
        grid[agent.position.y][agent.position.x] = _AGENT_ARROWS[
            agent.orientation.value
        ]
        return "\n".join("".join(row) for row in grid)

    # ------------------------------------------------------------------
    # Debug/test helpers (not for the agent execution path)
    # ------------------------------------------------------------------

    def debug_entities(self) -> dict[str, Entity]:
        """Full internal entity state. Debug/tests only."""
        return {k: v.model_copy(deep=True) for k, v in self._entities.items()}

    def load_debug_state(
        self,
        entities: dict[str, Entity],
        agent: AgentState,
        episode_id: str = "debug-episode",
    ) -> Observation:
        """Install an explicit world state. Tests/debug only."""
        self._entities = {k: v.model_copy(deep=True) for k, v in entities.items()}
        self._agent = agent.model_copy(deep=True)
        self._episode_id = episode_id
        self._terminal = False
        self._success = False
        self._terminal_reason = None
        self._last_result = None
        return self.observe()

    # ------------------------------------------------------------------
    # Action handlers
    # ------------------------------------------------------------------

    def _handle_move(self, action: Action) -> ActionResult:
        agent = self._require_agent()
        if (
            self.config.slip_probability > 0
            and self._rng.random() < self.config.slip_probability
        ):
            return ActionResult(success=False, message="slipped")
        target = forward_position(agent)
        if not self._in_bounds(target):
            return ActionResult(success=False, message="blocked by boundary")
        blocker = blocking_entity_at(self._entities, target)
        if blocker is not None:
            return ActionResult(
                success=False,
                message=f"blocked by {blocker.entity_type.value.lower()}",
            )
        agent.position = target
        result = ActionResult(
            success=True, message="moved forward", state_changed=True
        )
        goal = next(
            (
                e
                for e in entities_at(self._entities, target)
                if e.entity_type == EntityType.GOAL
            ),
            None,
        )
        if goal is not None:
            self._end_episode(success=True, reason="goal_reached")
            result.reward += self.config.goal_reward
            result.terminal = True
            result.message = "reached the goal"
        return result

    def _handle_turn_left(self, action: Action) -> ActionResult:
        agent = self._require_agent()
        agent.orientation = agent.orientation.turned_left()
        return ActionResult(success=True, message="turned left", state_changed=True)

    def _handle_turn_right(self, action: Action) -> ActionResult:
        agent = self._require_agent()
        agent.orientation = agent.orientation.turned_right()
        return ActionResult(success=True, message="turned right", state_changed=True)

    def _handle_noop(self, action: Action) -> ActionResult:
        return ActionResult(success=True, message="ok")

    def _handle_pick_up(self, action: Action) -> ActionResult:
        agent = self._require_agent()
        for position in (agent.position, forward_position(agent)):
            for entity in entities_at(self._entities, position):
                if entity.entity_type != EntityType.KEY:
                    continue
                if action.target_id and action.target_id != entity.entity_id:
                    continue
                entity.visible = False
                agent.inventory.append(entity.entity_id)
                return ActionResult(
                    success=True,
                    message=f"picked up {entity.entity_id}",
                    state_changed=True,
                )
        return ActionResult(success=False, message="nothing to pick up")

    def _handle_drop(self, action: Action) -> ActionResult:
        agent = self._require_agent()
        if not agent.inventory:
            return ActionResult(success=False, message="inventory is empty")
        item_id = (
            action.target_id
            if action.target_id in agent.inventory
            else agent.inventory[0]
        )
        agent.inventory.remove(item_id)
        entity = self._entities[item_id]
        entity.visible = True
        entity.position = agent.position
        return ActionResult(
            success=True, message=f"dropped {item_id}", state_changed=True
        )

    def _handle_open(self, action: Action) -> ActionResult:
        agent = self._require_agent()
        front = forward_position(agent)
        door = next(
            (
                e
                for e in entities_at(self._entities, front)
                if e.entity_type == EntityType.DOOR
            ),
            None,
        )
        if door is None:
            return ActionResult(success=False, message="no door ahead")
        if door.is_open:
            return ActionResult(success=False, message="door is already open")
        if door.key_id and door.key_id not in agent.inventory:
            return ActionResult(
                success=False, message="the door is locked; a key is needed"
            )
        door.locked = False
        door.is_open = True
        door.blocking = False
        return ActionResult(
            success=True, message="opened the door", state_changed=True
        )

    def _handle_press(self, action: Action) -> ActionResult:
        agent = self._require_agent()
        for position in (agent.position, forward_position(agent)):
            for entity in entities_at(self._entities, position):
                if entity.entity_type != EntityType.BUTTON:
                    continue
                if entity.pressed:
                    return ActionResult(
                        success=True, message="button already pressed"
                    )
                entity.pressed = True
                return ActionResult(
                    success=True,
                    message="pressed the button",
                    state_changed=True,
                    reward=self.config.button_reward,
                )
        return ActionResult(success=False, message="no button here")

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _move_hazards(self) -> None:
        for entity in self._entities.values():
            if entity.entity_type != EntityType.HAZARD or not entity.visible:
                continue
            dx, dy = {
                "NORTH": (0, -1),
                "SOUTH": (0, 1),
                "EAST": (1, 0),
                "WEST": (-1, 0),
            }[entity.direction]
            target = Position(
                x=entity.position.x + dx, y=entity.position.y + dy
            )
            if (
                self._in_bounds(target)
                and blocking_entity_at(self._entities, target) is None
            ):
                entity.position = target
            else:
                entity.direction = _OPPOSITE[entity.direction]

    def _require_agent(self) -> AgentState:
        if self._agent is None:
            raise RuntimeError("world not initialized; call reset() first")
        return self._agent

    def _in_bounds(self, position: Position) -> bool:
        return 0 <= position.x < self.config.width and (
            0 <= position.y < self.config.height
        )

    def _end_episode(self, success: bool, reason: str) -> None:
        self._terminal = True
        self._success = success
        self._terminal_reason = reason

    def _available_actions(self) -> list[ActionType]:
        agent = self._require_agent()
        front = forward_position(agent)
        actions = [
            ActionType.MOVE_FORWARD,
            ActionType.TURN_LEFT,
            ActionType.TURN_RIGHT,
            ActionType.OBSERVE,
            ActionType.WAIT,
        ]
        nearby = entities_at(self._entities, agent.position) + entities_at(
            self._entities, front
        )
        if any(e.entity_type == EntityType.KEY for e in nearby):
            actions.append(ActionType.PICK_UP)
        if agent.inventory:
            actions.append(ActionType.DROP)
        if any(
            e.entity_type == EntityType.DOOR
            for e in entities_at(self._entities, front)
        ):
            actions.extend([ActionType.OPEN, ActionType.USE])
        if any(e.entity_type == EntityType.BUTTON for e in nearby):
            actions.append(ActionType.PRESS)
        return actions
