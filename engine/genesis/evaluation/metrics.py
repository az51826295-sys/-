"""Prediction error: how far off the world model was."""

from __future__ import annotations

from genesis.config import GenesisConfig
from genesis.models.action import ActionResult
from genesis.models.prediction import Prediction
from genesis.models.state import Observation


def compute_prediction_error(
    prediction: Prediction,
    result: ActionResult,
    observation_after: Observation,
    config: GenesisConfig | None = None,
) -> float:
    cfg = config or GenesisConfig()

    success_error = 0.0 if prediction.predicted_success == result.success else 1.0
    reward_error = abs(prediction.predicted_reward - result.reward)
    position_error = float(
        prediction.predicted_position.manhattan_distance(
            observation_after.agent_state.position
        )
    )
    terminal_error = (
        0.0 if prediction.predicted_terminal == result.terminal else 1.0
    )

    return (
        cfg.success_error_weight * success_error
        + cfg.reward_error_weight * reward_error
        + cfg.position_error_weight * position_error
        + cfg.terminal_error_weight * terminal_error
    )
