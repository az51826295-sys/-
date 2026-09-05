"""Central configuration for the Genesis MVP."""

from pathlib import Path

from pydantic import BaseModel, ConfigDict


class GenesisConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")  # catch scenario-file typos

    # World
    width: int = 10
    height: int = 10
    initial_energy: int = 100
    max_steps: int = 200
    observation_radius: int = 2  # Manhattan distance the agent can see

    # Difficulty knobs (defaults reproduce the basic world)
    num_door_sections: int = 1  # vertical walls, each with one locked door
    num_hazards: int = 0  # patrolling hazards that damage on contact
    hazard_energy_damage: int = 5
    hazard_reward_penalty: float = -0.25
    slip_probability: float = 0.0  # chance a MOVE_FORWARD slips and fails

    # Rewards
    step_reward: float = -0.01
    goal_reward: float = 1.0
    button_reward: float = 0.5

    # Curiosity weights
    curiosity_novelty_weight: float = 1.0
    curiosity_error_weight: float = 1.0

    # Adaptive agent: probe a nearly-unknown action only above this
    # curiosity score, and only while energy stays above the reserve
    adaptive_curiosity_threshold: float = 0.9
    adaptive_energy_reserve: int = 50

    # Prediction error weights
    success_error_weight: float = 1.0
    reward_error_weight: float = 1.0
    position_error_weight: float = 0.5
    terminal_error_weight: float = 1.0

    # Storage
    db_path: Path = Path("data") / "genesis.db"


def load_scenario(path: Path | str) -> GenesisConfig:
    """Build a config from a JSON scenario file of GenesisConfig fields.

    Unknown keys raise a validation error so typos fail loudly.
    """
    import json

    with open(path, encoding="utf-8") as handle:
        return GenesisConfig(**json.load(handle))
