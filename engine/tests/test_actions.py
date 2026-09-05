"""Action edge cases and observation hygiene."""

from helpers import act, make_world

from genesis.environment.entities import make_door, make_key, make_wall
from genesis.models.action import ActionType
from genesis.models.state import Position


def test_pick_up_with_no_key_fails():
    world = make_world()
    _, result = world.step(act(ActionType.PICK_UP))
    assert not result.success


def test_drop_returns_key_to_map():
    world = make_world([make_key("key-1", Position(x=2, y=2))])
    world.step(act(ActionType.PICK_UP))
    observation, result = world.step(act(ActionType.DROP))
    assert result.success
    assert observation.agent_state.inventory == []
    dropped = world.debug_entities()["key-1"]
    assert dropped.visible
    assert dropped.position == Position(x=2, y=2)


def test_drop_with_empty_inventory_fails():
    world = make_world()
    _, result = world.step(act(ActionType.DROP))
    assert not result.success


def test_use_opens_door_like_open():
    door = make_door("door-1", Position(x=3, y=2), key_id="key-1")
    world = make_world([door], inventory=["key-1"])
    _, result = world.step(act(ActionType.USE))
    assert result.success
    assert world.debug_entities()["door-1"].is_open


def test_every_action_costs_energy():
    world = make_world()
    observation, _ = world.step(act(ActionType.OBSERVE))
    assert observation.agent_state.energy == 99
    observation, _ = world.step(act(ActionType.WAIT))
    assert observation.agent_state.energy == 98


def test_observation_radius_limits_visibility():
    near = make_wall(Position(x=4, y=2))  # distance 2
    far = make_wall(Position(x=5, y=2))  # distance 3
    world = make_world([near, far])
    observation = world.observe()
    ids = {e.entity_id for e in observation.visible_entities}
    assert near.entity_id in ids
    assert far.entity_id not in ids


def test_observation_never_leaks_entities_beyond_radius():
    world = make_world()
    world.reset(seed=42)
    observation = world.observe()
    agent_position = observation.agent_state.position
    assert all(
        e.position.manhattan_distance(agent_position) <= 2
        for e in observation.visible_entities
    )


def test_available_actions_are_contextual():
    world = make_world()
    observation = world.observe()
    assert ActionType.PICK_UP not in observation.available_actions
    assert ActionType.OPEN not in observation.available_actions

    world = make_world([make_key("key-1", Position(x=3, y=2))])
    observation = world.observe()
    assert ActionType.PICK_UP in observation.available_actions

    door = make_door("door-1", Position(x=3, y=2), key_id="key-1")
    world = make_world([door])
    observation = world.observe()
    assert ActionType.OPEN in observation.available_actions
    assert ActionType.USE in observation.available_actions
