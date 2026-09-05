"""Experience: one full observe -> predict -> act -> compare cycle."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from genesis.models.action import Action, ActionResult
from genesis.models.prediction import Prediction
from genesis.models.state import Observation


class Experience(BaseModel):
    experience_id: str
    episode_id: str
    step: int
    observation_before: Observation
    action: Action
    prediction: Prediction
    result: ActionResult
    observation_after: Observation
    prediction_error: float
    created_at: datetime


class EpisodeSummary(BaseModel):
    episode_id: str
    total_steps: int
    total_reward: float
    success: bool
    terminal_reason: str
    average_prediction_error: float
    experiences_saved: int
    hazard_hits: int = 0


class EpisodeRecord(BaseModel):
    """A persisted episode outcome plus the run context it happened in."""

    episode_id: str
    run_id: str
    agent: str
    model: str
    difficulty: str = "basic"
    world_seed: int | None = None
    total_steps: int
    total_reward: float
    success: bool
    terminal_reason: str
    average_prediction_error: float
    experiences_saved: int
    hazard_hits: int = 0
    created_at: datetime
