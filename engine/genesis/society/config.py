"""All Stage 1 constants and experiment switches in one place.

Every ablation the pre-registration (design doc 11) relies on is a field
here: trait variance, imitation, signals, misperception.
"""

from __future__ import annotations

from pydantic import BaseModel


class SocietyConfig(BaseModel):
    # --- world ---
    grid_size: int = 20
    n_agents: int = 12
    observation_radius: int = 3       # Manhattan
    focus_radius_bonus: int = 1       # OBSERVE grants this next tick
    signal_radius: int = 5
    witness_radius: int = 3
    n_water_blobs: int = 2
    water_blob_size: int = 8
    n_stones: int = 8
    n_wood: int = 8
    n_hazard_zones: int = 2
    hazard_zone_size: int = 4
    food_target_count: int = 25
    food_colors: tuple[str, ...] = ("red", "blue", "yellow")
    food_ripeness: tuple[str, ...] = ("ripe", "unripe")

    # --- metabolism / body ---
    max_energy: float = 100.0
    max_hydration: float = 100.0
    max_health: float = 100.0
    energy_drain: float = 0.7
    hydration_drain: float = 0.5
    thirst_damage: float = 1.0        # health loss per tick at hydration 0
    health_regen: float = 0.05        # per tick while energy > 60
    max_age: int = 1200
    food_energy_ripe: float = 30.0
    food_energy_unripe: float = 12.0
    drink_amount: float = 50.0
    hazard_damage: float = 15.0
    hazard_fear: float = 0.3
    fear_decay: float = 0.98
    attack_damage: float = 10.0
    attack_energy_cost: float = 3.0
    attack_fear: float = 0.2
    inventory_limit: int = 2

    # --- environment dynamics (schedule pre-generated at reset) ---
    season_length: int = 100
    winter_dry_fraction: float = 0.5     # fraction of water cells dry in winter
    winter_food_factor: float = 0.5      # food target multiplier in winter
    poison_probability: float = 0.5      # chance a poison window opens per autumn
    poison_health_delta: float = -20.0
    blockade_period: int = 150
    blockade_duration: int = 100
    respawn_probability: float = 0.3     # chance per tick to respawn 1 food

    # --- population ---
    replace_dead: bool = True

    # --- traits (ablation: trait_sd=0 makes clones) ---
    trait_mean: float = 0.5
    trait_sd: float = 0.15
    trait_min: float = 0.05
    trait_max: float = 0.95
    memory_capacity_mean: int = 200
    memory_capacity_sd: int = 50

    # --- decision ---
    softmax_temp_base: float = 0.3
    softmax_temp_curiosity: float = 0.7
    taxis_gain: float = 0.3          # innate approach gradient (decisions.md)
    novelty_gain: float = 0.05       # unvisited-cell bonus, scaled by curiosity
    harm_weight_health: float = 1.0
    harm_weight_energy: float = 0.3
    harm_weight_hydration: float = 0.3

    # --- ablation switches ---
    imitation_enabled: bool = True
    signals_enabled: bool = True
    misperception_enabled: bool = True
