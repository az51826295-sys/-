"""CuriousAgent: picks the available action the world model is least sure about.

It shares the world model with the agent loop, so every stored experience
immediately lowers the curiosity of the situation it came from and the
agent moves on to whatever it still predicts poorly. It never chases the
goal directly; its job is to generate maximally informative experiences.

The world model is agent-side knowledge (built purely from observations),
so consulting it does not breach the environment/agent boundary.
"""

from __future__ import annotations

import random
import uuid

from genesis.config import GenesisConfig
from genesis.evaluation.curiosity import CuriosityScorer
from genesis.models.action import Action, ActionType
from genesis.models.state import Observation
from genesis.world_model.naive_model import NaiveWorldModel


class CuriousAgent:
    def __init__(
        self,
        world_model: NaiveWorldModel,
        seed: int | None = None,
        config: GenesisConfig | None = None,
    ):
        self._scorer = CuriosityScorer(world_model, config)
        self._rng = random.Random(seed)

    def select_action(self, observation: Observation) -> Action:
        candidates = [
            self._action(action_type)
            for action_type in observation.available_actions
        ]
        scored = [
            (self._scorer.score(observation, action), action)
            for action in candidates
        ]
        best = max(score for score, _ in scored)
        top = [action for score, action in scored if score == best]
        return self._rng.choice(top)

    def _action(self, action_type: ActionType) -> Action:
        return Action(action_id=uuid.uuid4().hex[:12], action_type=action_type)
