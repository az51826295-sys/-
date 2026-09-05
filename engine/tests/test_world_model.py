"""NaiveWorldModel: rule predictions, experience updates, prediction error."""

import uuid
from datetime import datetime, timezone

import pytest
from helpers import act, make_experience, make_world

from genesis.config import GenesisConfig
from genesis.environment.entities import make_wall
from genesis.evaluation.metrics import compute_prediction_error
from genesis.memory.experience_store import ExperienceStore
from genesis.models.action import ActionResult, ActionType
from genesis.models.experience import Experience
from genesis.models.prediction import Prediction
from genesis.models.state import Position
from genesis.world_model.naive_model import NaiveWorldModel


def _experience_from(observation, action, success, reward=-0.01):
    return Experience(
        experience_id=uuid.uuid4().hex[:16],
        episode_id=observation.episode_id,
        step=observation.step,
        observation_before=observation,
        action=action,
        prediction=Prediction(
            prediction_id="p",
            predicted_success=True,
            predicted_reward=reward,
            predicted_position=observation.agent_state.position,
            predicted_terminal=False,
            confidence=0.5,
        ),
        result=ActionResult(success=success, reward=reward),
        observation_after=observation,
        prediction_error=0.0,
        created_at=datetime.now(timezone.utc),
    )


def test_predict_returns_prediction_with_base_confidence():
    model = NaiveWorldModel()
    observation = make_world().observe()
    prediction = model.predict(observation, act(ActionType.MOVE_FORWARD))
    assert isinstance(prediction, Prediction)
    assert prediction.confidence == pytest.approx(0.5)
    assert prediction.predicted_success


def test_rule_predicts_blocked_move():
    model = NaiveWorldModel()
    world = make_world([make_wall(Position(x=3, y=2))])
    prediction = model.predict(
        world.observe(), act(ActionType.MOVE_FORWARD)
    )
    assert not prediction.predicted_success
    assert prediction.predicted_position == Position(x=2, y=2)


def test_experience_updates_success_rate_and_confidence():
    model = NaiveWorldModel()
    observation = make_world().observe()
    action = act(ActionType.MOVE_FORWARD)

    baseline = model.predict(observation, action)
    assert baseline.predicted_success  # rule says open space ahead

    for _ in range(3):
        model.update(_experience_from(observation, action, success=False))

    updated = model.predict(observation, action)
    assert not updated.predicted_success
    assert updated.confidence > baseline.confidence


def test_update_ignores_other_state_keys():
    model = NaiveWorldModel()
    observation = make_world().observe()
    model.update(
        _experience_from(observation, act(ActionType.MOVE_FORWARD), False)
    )
    prediction = model.predict(observation, act(ActionType.TURN_LEFT))
    assert prediction.confidence == pytest.approx(0.5)


def test_rehydrate_restores_learning_from_store(tmp_path):
    store = ExperienceStore(tmp_path / "rehydrate.db")
    store.initialize()
    observation = make_world().observe()
    action = act(ActionType.MOVE_FORWARD)
    for _ in range(3):
        store.save(_experience_from(observation, action, success=False))

    model = NaiveWorldModel()
    restored = model.rehydrate(store.iter_all())
    assert restored == 3

    prediction = model.predict(observation, action)
    assert not prediction.predicted_success
    assert prediction.confidence > 0.5
    store.close()


def test_prediction_error_known_value():
    config = GenesisConfig()
    prediction = Prediction(
        prediction_id="p",
        predicted_success=True,
        predicted_reward=0.5,
        predicted_position=Position(x=2, y=2),
        predicted_terminal=False,
        confidence=0.5,
    )
    result = ActionResult(success=False, reward=0.0, terminal=True)
    observation_after = make_world(agent_pos=(3, 2)).observe()
    error = compute_prediction_error(
        prediction, result, observation_after, config
    )
    # success mismatch (1.0) + reward gap (0.5) + position gap (1 * 0.5)
    # + terminal mismatch (1.0)
    assert error == pytest.approx(3.0)


def test_prediction_error_zero_when_exact():
    config = GenesisConfig()
    observation_after = make_world(agent_pos=(2, 2)).observe()
    prediction = Prediction(
        prediction_id="p",
        predicted_success=True,
        predicted_reward=-0.01,
        predicted_position=Position(x=2, y=2),
        predicted_terminal=False,
        confidence=0.5,
    )
    result = ActionResult(success=True, reward=-0.01, terminal=False)
    error = compute_prediction_error(
        prediction, result, observation_after, config
    )
    assert error == pytest.approx(0.0)
