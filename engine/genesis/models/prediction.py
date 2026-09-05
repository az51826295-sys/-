"""Prediction model: what the world model expects an action to do."""

from __future__ import annotations

from pydantic import BaseModel

from genesis.models.state import Position


class Prediction(BaseModel):
    prediction_id: str
    predicted_success: bool
    predicted_reward: float
    predicted_position: Position
    predicted_terminal: bool
    confidence: float
    rationale: str = ""
