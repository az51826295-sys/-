"""Curiosity scoring: how interesting is an action in this situation?

score = novelty_weight * 1 / (1 + samples)
      + error_weight * mean_prediction_error

An action the world model has never tried in this situation is maximally
novel (novelty term 1.0). An action the model keeps mispredicting stays
interesting no matter how often it has been tried — historically high
prediction error means the model's understanding is still wrong there.
"""

from __future__ import annotations

from genesis.config import GenesisConfig
from genesis.models.action import Action
from genesis.models.state import Observation
from genesis.world_model.naive_model import NaiveWorldModel


class CuriosityScorer:
    def __init__(
        self,
        world_model: NaiveWorldModel,
        config: GenesisConfig | None = None,
    ):
        cfg = config or GenesisConfig()
        self.world_model = world_model
        self.novelty_weight = cfg.curiosity_novelty_weight
        self.error_weight = cfg.curiosity_error_weight

    def score(self, observation: Observation, action: Action) -> float:
        samples, mean_error = self.world_model.experience_stats(
            observation, action
        )
        novelty = 1.0 / (1.0 + samples)
        return self.novelty_weight * novelty + self.error_weight * mean_error
