"""Resource factories. Ids come from the world's deterministic counter."""

from __future__ import annotations

import random

from genesis.society.config import SocietyConfig
from genesis.society.models import Resource, ResourceType


def make_food(res_id: str, color: str, ripeness: str, config: SocietyConfig) -> Resource:
    energy = (
        config.food_energy_ripe if ripeness == "ripe" else config.food_energy_unripe
    )
    return Resource(
        resource_id=res_id,
        resource_type=ResourceType.FOOD,
        features={"color": color, "ripeness": ripeness},
        energy_value=energy,
        portable=True,
    )


def random_food(res_id: str, rng: random.Random, config: SocietyConfig) -> Resource:
    color = rng.choice(config.food_colors)
    ripeness = rng.choice(config.food_ripeness)
    return make_food(res_id, color, ripeness, config)


def make_stone(res_id: str) -> Resource:
    return Resource(resource_id=res_id, resource_type=ResourceType.STONE, portable=True)


def make_wood(res_id: str) -> Resource:
    return Resource(resource_id=res_id, resource_type=ResourceType.WOOD, portable=True)
