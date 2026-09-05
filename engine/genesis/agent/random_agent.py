"""RandomAgent: mostly random, with a few obvious priorities.

Priorities (based purely on the Observation):
1. PICK_UP when a key is in reach.
2. OPEN when a door is ahead and a key is in inventory.
3. PRESS when an unpressed button is in reach.
4. Otherwise move forward (60%) or turn left/right (20% each).
"""

from __future__ import annotations

import random
import uuid

from genesis.environment.rules import entities_at, forward_position
from genesis.models.action import Action, ActionType
from genesis.models.state import EntityType, Observation


class RandomAgent:
    def __init__(self, seed: int | None = None):
        self._rng = random.Random(seed)

    def select_action(self, observation: Observation) -> Action:
        available = set(observation.available_actions)
        agent = observation.agent_state

        if ActionType.PICK_UP in available:
            return self._action(ActionType.PICK_UP)
        if ActionType.OPEN in available and agent.inventory:
            return self._action(ActionType.OPEN)
        if ActionType.PRESS in available and self._unpressed_button_nearby(
            observation
        ):
            return self._action(ActionType.PRESS)

        roll = self._rng.random()
        if roll < 0.6:
            return self._action(ActionType.MOVE_FORWARD)
        if roll < 0.8:
            return self._action(ActionType.TURN_LEFT)
        return self._action(ActionType.TURN_RIGHT)

    def _unpressed_button_nearby(self, observation: Observation) -> bool:
        agent = observation.agent_state
        nearby = entities_at(
            observation.visible_entities, agent.position
        ) + entities_at(observation.visible_entities, forward_position(agent))
        return any(
            e.entity_type == EntityType.BUTTON and not e.pressed
            for e in nearby
        )

    def _action(self, action_type: ActionType) -> Action:
        return Action(action_id=uuid.uuid4().hex[:12], action_type=action_type)
