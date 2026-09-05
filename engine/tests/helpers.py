"""Shared test helpers for building worlds, observations, and experiences."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from genesis.config import GenesisConfig
from genesis.environment.world import GenesisWorld
from genesis.models.action import Action, ActionResult, ActionType
from genesis.models.experience import Experience
from genesis.models.prediction import Prediction
from genesis.models.state import (
    AgentState,
    Entity,
    Observation,
    Orientation,
    Position,
)


def act(action_type: ActionType, target_id: str | None = None) -> Action:
    return Action(
        action_id=uuid.uuid4().hex[:8],
        action_type=action_type,
        target_id=target_id,
    )


def make_world(
    entities: list[Entity] | None = None,
    agent_pos: tuple[int, int] = (2, 2),
    orientation: Orientation = Orientation.EAST,
    inventory: list[str] | None = None,
    energy: int = 100,
    config: GenesisConfig | None = None,
) -> GenesisWorld:
    world = GenesisWorld(config or GenesisConfig())
    agent = AgentState(
        position=Position(x=agent_pos[0], y=agent_pos[1]),
        orientation=orientation,
        inventory=list(inventory or []),
        energy=energy,
        step_count=0,
    )
    world.load_debug_state(
        {e.entity_id: e for e in (entities or [])}, agent
    )
    return world


def make_observation(
    episode_id: str = "ep-test",
    step: int = 0,
    pos: tuple[int, int] = (2, 2),
) -> Observation:
    return Observation(
        episode_id=episode_id,
        step=step,
        agent_state=AgentState(
            position=Position(x=pos[0], y=pos[1]),
            orientation=Orientation.EAST,
            energy=100,
            step_count=step,
        ),
    )


def make_experience(
    episode_id: str = "ep-test",
    step: int = 0,
    success: bool = True,
    created_at: datetime | None = None,
) -> Experience:
    observation_before = make_observation(episode_id, step)
    observation_after = make_observation(episode_id, step + 1, pos=(3, 2))
    return Experience(
        experience_id=uuid.uuid4().hex[:16],
        episode_id=episode_id,
        step=step,
        observation_before=observation_before,
        action=act(ActionType.MOVE_FORWARD),
        prediction=Prediction(
            prediction_id=uuid.uuid4().hex[:12],
            predicted_success=True,
            predicted_reward=-0.01,
            predicted_position=Position(x=3, y=2),
            predicted_terminal=False,
            confidence=0.5,
            rationale="test",
        ),
        result=ActionResult(
            success=success, message="moved", state_changed=True, reward=-0.01
        ),
        observation_after=observation_after,
        prediction_error=0.0,
        created_at=created_at or datetime.now(timezone.utc),
    )
