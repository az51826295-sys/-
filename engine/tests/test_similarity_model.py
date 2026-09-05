"""SimilarityWorldModel: graded retrieval beyond the exact state key."""

import uuid
from datetime import datetime, timezone

import pytest
from helpers import act, make_world

from genesis.environment.entities import make_button, make_door
from genesis.models.action import ActionResult, ActionType
from genesis.models.experience import Experience
from genesis.models.prediction import Prediction
from genesis.models.state import Position
from genesis.world_model.naive_model import NaiveWorldModel
from genesis.world_model.similarity_model import (
    FRONT_WEIGHT,
    HAZARD_WEIGHT,
    HERE_WEIGHT,
    KEY_WEIGHT,
    MIN_SIMILARITY,
    ORIENTATION_WEIGHT,
    POSITION_WEIGHT,
    SimilarityWorldModel,
    extract_features,
    similarity,
)


def _experience_from(observation, action, success=True, reward=-0.01, error=0.0):
    return Experience(
        experience_id=uuid.uuid4().hex[:16],
        episode_id=observation.episode_id,
        step=observation.step,
        observation_before=observation,
        action=action,
        prediction=Prediction(
            prediction_id="p",
            predicted_success=True,
            predicted_reward=-0.01,
            predicted_position=observation.agent_state.position,
            predicted_terminal=False,
            confidence=0.5,
        ),
        result=ActionResult(success=success, reward=reward),
        observation_after=observation,
        prediction_error=error,
        created_at=datetime.now(timezone.utc),
    )


def _closed_door_obs():
    door = make_door("door-1", Position(x=3, y=2), key_id="key-1")
    return make_world([door], inventory=["key-1"]).observe()


def _open_door_obs():
    door = make_door("door-1", Position(x=3, y=2), key_id="key-1")
    door.is_open = True
    door.locked = False
    door.blocking = False
    return make_world([door], inventory=["key-1"]).observe()


def test_features_distinguish_door_state():
    move = act(ActionType.MOVE_FORWARD)
    closed = extract_features(_closed_door_obs(), move)
    opened = extract_features(_open_door_obs(), move)
    assert closed.front_kind == "DOOR_CLOSED"
    assert opened.front_kind == "DOOR_OPEN"


def test_identical_situations_have_similarity_one():
    features = extract_features(
        make_world().observe(), act(ActionType.MOVE_FORWARD)
    )
    assert similarity(features, features) == pytest.approx(1.0)


def test_different_action_types_never_match():
    observation = make_world().observe()
    a = extract_features(observation, act(ActionType.MOVE_FORWARD))
    b = extract_features(observation, act(ActionType.TURN_LEFT))
    assert similarity(a, b) == 0.0


def test_similarity_decays_with_distance():
    move = act(ActionType.MOVE_FORWARD)
    near_a = extract_features(
        make_world(agent_pos=(2, 2)).observe(), move
    )
    near_b = extract_features(
        make_world(agent_pos=(3, 2)).observe(), move
    )
    far = extract_features(
        make_world(agent_pos=(8, 8)).observe(), move
    )
    assert similarity(near_a, near_b) > similarity(near_a, far)


def test_open_and_closed_door_outcomes_stay_separate():
    """The naive model's known confusion: MOVE into DOOR mixes open and
    closed doors under one state key. Similarity retrieval keeps them apart."""
    closed_obs = _closed_door_obs()
    open_obs = _open_door_obs()
    move = act(ActionType.MOVE_FORWARD)

    similarity_model = SimilarityWorldModel()
    naive_model = NaiveWorldModel()
    for _ in range(3):
        for model in (similarity_model, naive_model):
            model.update(_experience_from(closed_obs, move, success=False))
            model.update(_experience_from(open_obs, move, success=True))

    assert not similarity_model.predict(closed_obs, move).predicted_success
    assert similarity_model.predict(open_obs, move).predicted_success
    # The naive model collapses both situations into one 50/50 key,
    # so it must give the same answer for both -- the failure this
    # model exists to fix.
    naive_closed = naive_model.predict(closed_obs, move).predicted_success
    naive_open = naive_model.predict(open_obs, move).predicted_success
    assert naive_closed == naive_open


def test_button_reward_predictions_stay_separate():
    unpressed = make_world(
        [make_button("button-1", Position(x=3, y=2))]
    ).observe()
    pressed_button = make_button("button-1", Position(x=3, y=2))
    pressed_button.pressed = True
    pressed = make_world([pressed_button]).observe()
    press = act(ActionType.PRESS)

    model = SimilarityWorldModel()
    for _ in range(3):
        model.update(_experience_from(unpressed, press, reward=0.49))
        model.update(_experience_from(pressed, press, reward=-0.01))

    assert model.predict(unpressed, press).predicted_reward == pytest.approx(
        0.49
    )
    assert model.predict(pressed, press).predicted_reward == pytest.approx(
        -0.01
    )


def test_curiosity_gains_spatial_resolution():
    move = act(ActionType.MOVE_FORWARD)
    here = make_world(agent_pos=(2, 2)).observe()
    elsewhere = make_world(agent_pos=(7, 7)).observe()

    model = SimilarityWorldModel()
    for _ in range(3):
        model.update(_experience_from(here, move))

    weight_here, _ = model.experience_stats(here, move)
    weight_elsewhere, _ = model.experience_stats(elsewhere, move)
    assert weight_here > weight_elsewhere


def test_bucketing_invariant_holds():
    """Retrieval buckets by (action_type, front_kind); that is only
    lossless while a front-kind mismatch alone falls below the
    retrieval threshold and all weights sum to 1.0."""
    total = (
        FRONT_WEIGHT
        + KEY_WEIGHT
        + HERE_WEIGHT
        + POSITION_WEIGHT
        + ORIENTATION_WEIGHT
        + HAZARD_WEIGHT
    )
    assert total == pytest.approx(1.0)
    assert 1.0 - FRONT_WEIGHT < MIN_SIMILARITY

    move = act(ActionType.MOVE_FORWARD)
    open_features = extract_features(_open_door_obs(), move)
    closed_features = extract_features(_closed_door_obs(), move)
    assert similarity(open_features, closed_features) < MIN_SIMILARITY


def test_record_count_tracks_updates():
    model = SimilarityWorldModel()
    observation = make_world().observe()
    for _ in range(3):
        model.update(
            _experience_from(observation, act(ActionType.MOVE_FORWARD))
        )
    model.update(_experience_from(observation, act(ActionType.TURN_LEFT)))
    assert model.record_count() == 4


def test_rule_fallback_when_no_similar_experience():
    model = SimilarityWorldModel()
    prediction = model.predict(
        make_world().observe(), act(ActionType.MOVE_FORWARD)
    )
    assert prediction.confidence == pytest.approx(0.5)
    assert prediction.rationale.startswith("rule:")


def test_rehydrate_counts_and_learns(tmp_path):
    from genesis.memory.experience_store import ExperienceStore

    store = ExperienceStore(tmp_path / "sim.db")
    store.initialize()
    observation = make_world().observe()
    move = act(ActionType.MOVE_FORWARD)
    for _ in range(3):
        store.save(_experience_from(observation, move, success=False))

    model = SimilarityWorldModel()
    assert model.rehydrate(store.iter_all()) == 3
    assert not model.predict(observation, move).predicted_success
    store.close()
