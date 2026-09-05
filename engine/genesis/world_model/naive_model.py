"""NaiveWorldModel: rule-based predictions, refined by accumulated experience.

State key: (orientation, action type, entity type directly ahead, has-key).
Once the model has seen the same state key before, it predicts from the
observed success rate and mean reward instead of the base rules, with
confidence growing with the number of samples.
"""

from __future__ import annotations

import json
import uuid
from typing import Iterable

from genesis.config import GenesisConfig
from genesis.environment.rules import entities_at, forward_position
from genesis.models.action import Action, ActionType
from genesis.models.experience import Experience
from genesis.models.prediction import Prediction
from genesis.models.state import EntityType, Observation, Position

BASE_CONFIDENCE = 0.5
CONFIDENCE_PER_SAMPLE = 0.05
MAX_CONFIDENCE = 0.95

StateKey = tuple[str, str, str, bool]


class NaiveWorldModel:
    def __init__(self, config: GenesisConfig | None = None):
        self.config = config or GenesisConfig()
        # state key -> [samples, successes, reward_sum, error_sum]
        self._stats: dict[StateKey, list[float]] = {}

    def predict(self, observation: Observation, action: Action) -> Prediction:
        success, reward, position, terminal, rationale = self._rule_prediction(
            observation, action
        )
        confidence = BASE_CONFIDENCE

        key = self.state_key(observation, action)
        stats = self._stats.get(key)
        if stats and stats[0] > 0:
            samples, successes, reward_sum, _error_sum = stats
            success_rate = successes / samples
            success = success_rate >= 0.5
            reward = reward_sum / samples
            confidence = min(
                MAX_CONFIDENCE, BASE_CONFIDENCE + CONFIDENCE_PER_SAMPLE * samples
            )
            rationale = (
                f"experience: {int(successes)}/{int(samples)} succeeded "
                f"in this situation"
            )
            position = self._expected_position(observation, action, success)

        return Prediction(
            prediction_id=uuid.uuid4().hex[:12],
            predicted_success=success,
            predicted_reward=reward,
            predicted_position=position,
            predicted_terminal=terminal,
            confidence=confidence,
            rationale=rationale,
        )

    def update(self, experience: Experience) -> None:
        key = self.state_key(experience.observation_before, experience.action)
        stats = self._stats.setdefault(key, [0.0, 0.0, 0.0, 0.0])
        stats[0] += 1
        stats[1] += 1.0 if experience.result.success else 0.0
        stats[2] += experience.result.reward
        stats[3] += experience.prediction_error

    def experience_stats(
        self, observation: Observation, action: Action
    ) -> tuple[int, float]:
        """(samples, mean prediction error) for this situation's state key."""
        stats = self._stats.get(self.state_key(observation, action))
        if not stats or stats[0] == 0:
            return 0, 0.0
        return int(stats[0]), stats[3] / stats[0]

    def rehydrate(self, experiences: Iterable[Experience]) -> int:
        """Replay stored experiences so learning persists across runs.

        Returns the number of experiences absorbed.
        """
        count = 0
        for experience in experiences:
            self.update(experience)
            count += 1
        return count

    def front_kind_reward(
        self, action_type: str, front_kind: str
    ) -> tuple[float, float]:
        """(samples, mean reward) for taking an action toward a kind of cell.

        Aggregated across orientations and inventory states; used by
        planners to learn path costs (e.g. what moving toward a HAZARD
        has historically cost). front_kind here is the naive state key's
        front type (e.g. "HAZARD", "NONE").
        """
        samples = 0.0
        reward_sum = 0.0
        for (_, key_action, key_front, _), stats in self._stats.items():
            if key_action == action_type and key_front == front_kind:
                samples += stats[0]
                reward_sum += stats[2]
        if samples == 0:
            return 0.0, 0.0
        return samples, reward_sum / samples

    def front_kind_success(
        self, action_type: str, front_kind: str
    ) -> tuple[float, float]:
        """(samples, success rate) for an action toward a kind of cell."""
        samples = 0.0
        successes = 0.0
        for (_, key_action, key_front, _), stats in self._stats.items():
            if key_action == action_type and key_front == front_kind:
                samples += stats[0]
                successes += stats[1]
        if samples == 0:
            return 0.0, 0.0
        return samples, successes / samples

    def hazard_context_reward(
        self, action_type: str | None = None
    ) -> tuple[float, float]:
        """Naive approximation: reward of acting toward a visible hazard."""
        samples = 0.0
        reward_sum = 0.0
        for (_, key_action, key_front, _), stats in self._stats.items():
            if key_front != "HAZARD":
                continue
            if action_type is not None and key_action != action_type:
                continue
            samples += stats[0]
            reward_sum += stats[2]
        if samples == 0:
            return 0.0, 0.0
        return samples, reward_sum / samples

    def dump_state(self) -> str:
        """Serialize learned state for snapshotting."""
        return json.dumps(
            {
                "stats": [
                    [list(key), stats] for key, stats in self._stats.items()
                ]
            }
        )

    def load_state(self, payload: str) -> None:
        data = json.loads(payload)
        self._stats = {
            tuple(key): list(stats) for key, stats in data["stats"]
        }

    def state_key(self, observation: Observation, action: Action) -> StateKey:
        agent = observation.agent_state
        front = forward_position(agent)
        front_entities = entities_at(observation.visible_entities, front)
        blocking = [e for e in front_entities if e.blocking]
        if blocking:
            front_type = blocking[0].entity_type.value
        elif front_entities:
            front_type = front_entities[0].entity_type.value
        else:
            front_type = "NONE"
        return (
            agent.orientation.value,
            action.action_type.value,
            front_type,
            bool(agent.inventory),
        )

    # ------------------------------------------------------------------

    def _rule_prediction(
        self, observation: Observation, action: Action
    ) -> tuple[bool, float, Position, bool, str]:
        agent = observation.agent_state
        front = forward_position(agent)
        front_entities = entities_at(observation.visible_entities, front)
        here_entities = entities_at(
            observation.visible_entities, agent.position
        )
        nearby = here_entities + front_entities

        success = True
        reward = self.config.step_reward
        position = agent.position
        terminal = False
        rationale = "rule: action is expected to succeed"
        action_type = action.action_type

        if action_type == ActionType.MOVE_FORWARD:
            if any(e.blocking for e in front_entities):
                success = False
                rationale = "rule: the way ahead is blocked"
            else:
                position = front
                if any(
                    e.entity_type == EntityType.GOAL for e in front_entities
                ):
                    terminal = True
                    reward += self.config.goal_reward
                    rationale = "rule: moving onto the goal ends the episode"
        elif action_type == ActionType.PICK_UP:
            success = any(e.entity_type == EntityType.KEY for e in nearby)
            rationale = (
                "rule: a key is in reach"
                if success
                else "rule: nothing to pick up"
            )
        elif action_type in (ActionType.OPEN, ActionType.USE):
            door = next(
                (
                    e
                    for e in front_entities
                    if e.entity_type == EntityType.DOOR
                ),
                None,
            )
            success = (
                door is not None
                and not door.is_open
                and bool(agent.inventory)
            )
            rationale = (
                "rule: a closed door ahead and a key in inventory"
                if success
                else "rule: no openable door ahead or no key"
            )
        elif action_type == ActionType.PRESS:
            button = next(
                (
                    e
                    for e in nearby
                    if e.entity_type == EntityType.BUTTON
                ),
                None,
            )
            success = button is not None
            if button is not None and not button.pressed:
                reward += self.config.button_reward
            rationale = (
                "rule: a button is in reach"
                if success
                else "rule: no button here"
            )
        elif action_type == ActionType.DROP:
            success = bool(agent.inventory)
            rationale = (
                "rule: inventory has an item"
                if success
                else "rule: inventory is empty"
            )

        return success, reward, position, terminal, rationale

    def _expected_position(
        self, observation: Observation, action: Action, success: bool
    ) -> Position:
        agent = observation.agent_state
        if success and action.action_type == ActionType.MOVE_FORWARD:
            return forward_position(agent)
        return agent.position
