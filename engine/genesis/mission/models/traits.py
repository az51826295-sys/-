"""Agent dispositions. Four traits (decision 19); immutable after birth."""

from __future__ import annotations

import random

from pydantic import BaseModel

from genesis.mission.config import MissionConfig


class AgentTraits(BaseModel):
    novelty_preference: float
    risk_tolerance: float
    criticism_tendency: float
    simplicity_preference: float


def sample_traits(rng: random.Random, config: MissionConfig) -> AgentTraits:
    def draw() -> float:
        v = rng.gauss(config.trait_mean, config.trait_sd)
        return min(config.trait_max, max(config.trait_min, v))

    return AgentTraits(
        novelty_preference=draw(),
        risk_tolerance=draw(),
        criticism_tendency=draw(),
        simplicity_preference=draw(),
    )
