"""Model-informed planning: hazard avoidance learned from experience."""

import pytest
from helpers import act, make_world

from genesis.agent.adaptive_agent import AdaptiveAgent
from genesis.environment.entities import make_hazard
from genesis.models.action import ActionResult, ActionType
from genesis.models.state import Position
from genesis.world_model.naive_model import NaiveWorldModel
from genesis.world_model.similarity_model import SimilarityWorldModel
from test_similarity_model import _experience_from


def _hazard_obs():
    """An observation with a hazard in view (feature hazard_near=True)."""
    hazard = make_hazard("hazard-1", Position(x=3, y=2), direction="NORTH")
    return make_world([hazard]).observe()


def _teach_hazard_pain(model, times=5, reward=-0.6):
    observation = _hazard_obs()
    for _ in range(times):
        model.update(
            _experience_from(
                observation,
                act(ActionType.MOVE_FORWARD),
                success=True,
                reward=reward,
            )
        )


def test_features_flag_visible_hazards():
    from genesis.world_model.similarity_model import extract_features

    with_hazard = extract_features(_hazard_obs(), act(ActionType.MOVE_FORWARD))
    without = extract_features(
        make_world().observe(), act(ActionType.MOVE_FORWARD)
    )
    assert with_hazard.hazard_near and not without.hazard_near


def test_hazard_context_reward_aggregates_painful_moves():
    model = SimilarityWorldModel()
    _teach_hazard_pain(model)
    samples, mean_reward = model.hazard_context_reward("MOVE_FORWARD")
    assert samples == 5
    assert mean_reward == pytest.approx(-0.6)


def test_naive_model_has_compatible_hazard_api():
    samples, mean_reward = NaiveWorldModel().hazard_context_reward(
        "MOVE_FORWARD"
    )
    assert samples == 0 and mean_reward == 0.0


def _agent_with_memory(model):
    """Adaptive agent knowing an open 7x5 area; a hazard patrols column x=3."""
    agent = AdaptiveAgent(model, seed=0)
    agent._reset_memory("ep-test")
    agent._known = {
        (x, y): "free" for x in range(0, 7) for y in range(0, 5)
    }
    agent._hazards = {"hazard-1": (3, 2)}
    agent._hazard_directions = {"hazard-1": "NORTH"}
    return agent


def test_fresh_model_plans_straight_along_patrol_line():
    agent = _agent_with_memory(SimilarityWorldModel())
    path = agent._bfs((3, 0), {(3, 4)}, [])
    assert path is not None
    assert (3, 2) in path  # shortest route, no learned reason to avoid


def test_trained_model_plans_around_patrol_line():
    model = SimilarityWorldModel()
    _teach_hazard_pain(model)
    agent = _agent_with_memory(model)
    path = agent._bfs((3, 0), {(3, 4)}, [])
    assert path is not None
    # The patrol column x=3 should only be touched to arrive at the
    # target, never traveled along.
    column_cells = [cell for cell in path if cell[0] == 3]
    assert column_cells == [(3, 4)]


def test_learned_caution_suppresses_probes_near_hazards():
    trained = SimilarityWorldModel()
    _teach_hazard_pain(trained)
    observation = _hazard_obs()

    cautious = AdaptiveAgent(trained, seed=0)
    cautious._reset_memory(observation.episode_id)
    assert cautious._exploration_probe(observation) is None

    fearless = AdaptiveAgent(SimilarityWorldModel(), seed=0)
    fearless._reset_memory(observation.episode_id)
    assert fearless._exploration_probe(observation) is not None


def _obs_with_hazard(offset, direction, agent_pos=(2, 2)):
    hazard = make_hazard(
        "hazard-1",
        Position(x=agent_pos[0] + offset[0], y=agent_pos[1] + offset[1]),
        direction=direction,
    )
    return make_world([hazard], agent_pos=agent_pos).observe()


def test_features_capture_nearest_hazard_geometry():
    from genesis.world_model.similarity_model import extract_features

    near = make_hazard("hazard-1", Position(x=2, y=3), direction="NORTH")
    far = make_hazard("hazard-2", Position(x=4, y=2), direction="SOUTH")
    observation = make_world([near, far]).observe()
    features = extract_features(observation, act(ActionType.MOVE_FORWARD))
    assert (features.hazard_dx, features.hazard_dy) == (0, 1)
    assert features.hazard_heading == "NORTH"


def test_hazard_geometry_gates_similarity():
    from genesis.world_model.similarity_model import (
        MIN_SIMILARITY,
        extract_features,
        similarity,
    )

    move = act(ActionType.MOVE_FORWARD)
    below = extract_features(_obs_with_hazard((0, 1), "NORTH"), move)
    same = extract_features(_obs_with_hazard((0, 1), "NORTH"), move)
    elsewhere = extract_features(_obs_with_hazard((2, 0), "SOUTH"), move)
    no_hazard = extract_features(make_world().observe(), move)

    assert similarity(below, same) == pytest.approx(1.0)
    assert similarity(below, elsewhere) < MIN_SIMILARITY
    assert similarity(below, no_hazard) < MIN_SIMILARITY


def test_prediction_anticipates_individual_hits():
    """Same spot, same visible hazard count -- but the model predicts pain
    only for the geometry where pain actually happened."""
    move = act(ActionType.MOVE_FORWARD)
    dangerous = _obs_with_hazard((0, 1), "NORTH")  # adjacent, closing in
    harmless = _obs_with_hazard((2, 0), "SOUTH")  # off to the side

    model = SimilarityWorldModel()
    for _ in range(3):
        model.update(
            _experience_from(dangerous, move, success=True, reward=-1.01)
        )
        model.update(
            _experience_from(harmless, move, success=True, reward=-0.01)
        )

    assert model.predict(dangerous, move).predicted_reward == pytest.approx(
        -1.01
    )
    assert model.predict(harmless, move).predicted_reward == pytest.approx(
        -0.01
    )


def test_old_snapshot_payload_still_loads():
    import json

    payload = json.dumps(
        {
            "records": [
                [
                    ["MOVE_FORWARD", "EAST", False, 2, 2, "NONE", "NONE"],
                    True,
                    -0.01,
                    0.0,
                ]
            ]
        }
    )
    model = SimilarityWorldModel()
    model.load_state(payload)
    assert model.record_count() == 1


def test_front_kind_success_rates():
    from genesis.environment.entities import make_door

    door = make_door("door-1", Position(x=3, y=2), key_id="key-1")
    observation = make_world([door], inventory=["key-1"]).observe()
    move = act(ActionType.MOVE_FORWARD)

    model = SimilarityWorldModel()
    for success in (False, False, True, False):
        model.update(_experience_from(observation, move, success=success))
    samples, rate = model.front_kind_success("MOVE_FORWARD", "DOOR_CLOSED")
    assert samples == 4
    assert rate == pytest.approx(0.25)
    assert model.front_kind_success("MOVE_FORWARD", "NONE") == (0.0, 0.0)


def _door_route_agent(model):
    """Known 6x5 area; a wall column at x=3 (y=0..2) with a door at (3, 1);
    an open detour exists along y=3."""
    agent = AdaptiveAgent(model, seed=0)
    agent._reset_memory("ep-test")
    agent._known = {
        (x, y): "free" for x in range(0, 6) for y in range(0, 5)
    }
    agent._known[(3, 0)] = "wall"
    agent._known[(3, 2)] = "wall"
    agent._known[(3, 1)] = "door"
    from genesis.environment.entities import make_door

    agent._doors = {
        (3, 1): make_door("door-1", Position(x=3, y=1), key_id="key-1")
    }
    return agent


def test_fresh_model_takes_the_door_shortcut():
    agent = _door_route_agent(SimilarityWorldModel())
    path = agent._bfs((1, 1), {(4, 2)}, ["key-1"])
    assert path is not None
    assert (3, 1) in path


def test_learned_door_cost_makes_detour_win():
    from genesis.environment.entities import make_door

    door = make_door("door-1", Position(x=3, y=2), key_id="key-1")
    closed_door_obs = make_world([door], inventory=["key-1"]).observe()
    move = act(ActionType.MOVE_FORWARD)

    model = SimilarityWorldModel()
    for _ in range(4):  # bumping into the closed door never works
        model.update(
            _experience_from(closed_door_obs, move, success=False)
        )

    agent = _door_route_agent(model)
    path = agent._bfs((1, 1), {(4, 2)}, ["key-1"])
    assert path is not None
    assert (3, 1) not in path  # the open detour is now cheaper


def test_hazard_memory_tracks_moving_hazards():
    hazard = make_hazard("hazard-1", Position(x=3, y=2), direction="SOUTH")
    world = make_world([hazard], agent_pos=(2, 2))
    agent = AdaptiveAgent(SimilarityWorldModel(), seed=0)
    observation = world.observe()
    agent.select_action(observation)
    assert agent._hazards["hazard-1"] == (3, 2)
    observation, _ = world.step(act(ActionType.WAIT))  # hazard moves to (3, 3)
    agent.select_action(observation)
    assert agent._hazards["hazard-1"] == (3, 3)
