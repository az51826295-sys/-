"""Environment behavior: generation, movement, doors, buttons, termination."""

import pytest
from helpers import act, make_world

from genesis.config import GenesisConfig
from genesis.environment.entities import (
    make_button,
    make_door,
    make_goal,
    make_key,
    make_wall,
)
from genesis.environment.world import GenesisWorld
from genesis.models.action import ActionType
from genesis.models.state import EntityType, Orientation, Position


def test_same_seed_generates_same_map():
    w1, w2 = GenesisWorld(), GenesisWorld()
    w1.reset(seed=42)
    w2.reset(seed=42)
    assert w1.render_text() == w2.render_text()
    dump1 = {k: v.model_dump() for k, v in w1.debug_entities().items()}
    dump2 = {k: v.model_dump() for k, v in w2.debug_entities().items()}
    assert dump1 == dump2


def test_different_seeds_generate_different_maps():
    world = GenesisWorld()
    renders = set()
    for seed in range(5):
        world.reset(seed=seed)
        renders.add(world.render_text())
    assert len(renders) > 1


def test_map_size():
    world = GenesisWorld()
    world.reset(seed=42)
    lines = world.render_text().splitlines()
    assert len(lines) == 10
    assert all(len(line) == 10 for line in lines)


def test_generated_map_has_required_entities():
    world = GenesisWorld()
    world.reset(seed=42)
    types = [e.entity_type for e in world.debug_entities().values()]
    assert types.count(EntityType.KEY) == 1
    assert types.count(EntityType.DOOR) == 1
    assert types.count(EntityType.BUTTON) == 1
    assert types.count(EntityType.GOAL) == 1
    assert types.count(EntityType.WALL) > 10


def test_agent_cannot_leave_bounds():
    world = make_world(agent_pos=(0, 0), orientation=Orientation.WEST)
    observation, result = world.step(act(ActionType.MOVE_FORWARD))
    assert not result.success
    assert observation.agent_state.position == Position(x=0, y=0)


def test_wall_blocks_movement():
    world = make_world([make_wall(Position(x=3, y=2))])
    observation, result = world.step(act(ActionType.MOVE_FORWARD))
    assert not result.success
    assert observation.agent_state.position == Position(x=2, y=2)


def test_turning():
    world = make_world(orientation=Orientation.EAST)
    observation, _ = world.step(act(ActionType.TURN_LEFT))
    assert observation.agent_state.orientation == Orientation.NORTH
    observation, _ = world.step(act(ActionType.TURN_RIGHT))
    assert observation.agent_state.orientation == Orientation.EAST
    observation, _ = world.step(act(ActionType.TURN_RIGHT))
    assert observation.agent_state.orientation == Orientation.SOUTH


def test_pick_up_key_on_same_cell():
    world = make_world([make_key("key-1", Position(x=2, y=2))])
    observation, result = world.step(act(ActionType.PICK_UP))
    assert result.success
    assert observation.agent_state.inventory == ["key-1"]
    assert not world.debug_entities()["key-1"].visible


def test_pick_up_key_in_front():
    world = make_world([make_key("key-1", Position(x=3, y=2))])
    observation, result = world.step(act(ActionType.PICK_UP))
    assert result.success
    assert observation.agent_state.inventory == ["key-1"]


def test_cannot_open_locked_door_without_key():
    door = make_door("door-1", Position(x=3, y=2), key_id="key-1")
    world = make_world([door])
    _, result = world.step(act(ActionType.OPEN))
    assert not result.success
    _, move_result = world.step(act(ActionType.MOVE_FORWARD))
    assert not move_result.success


def test_open_door_with_key():
    door = make_door("door-1", Position(x=3, y=2), key_id="key-1")
    world = make_world([door], inventory=["key-1"])
    _, result = world.step(act(ActionType.OPEN))
    assert result.success
    opened = world.debug_entities()["door-1"]
    assert opened.is_open and not opened.blocking and not opened.locked
    observation, move_result = world.step(act(ActionType.MOVE_FORWARD))
    assert move_result.success
    assert observation.agent_state.position == Position(x=3, y=2)


def test_press_button_rewards_once():
    config = GenesisConfig()
    world = make_world(
        [make_button("button-1", Position(x=3, y=2))], config=config
    )
    _, result = world.step(act(ActionType.PRESS))
    assert result.success
    assert result.reward == pytest.approx(
        config.button_reward + config.step_reward
    )
    _, second = world.step(act(ActionType.PRESS))
    assert second.success
    assert second.reward == pytest.approx(config.step_reward)


def test_goal_ends_episode():
    world = make_world([make_goal(Position(x=3, y=2))])
    observation, result = world.step(act(ActionType.MOVE_FORWARD))
    assert result.success and result.terminal
    assert observation.terminal and observation.success
    assert world.is_terminal()
    assert world.terminal_reason == "goal_reached"


def test_energy_depletion_ends_episode():
    world = make_world(energy=1)
    observation, result = world.step(act(ActionType.WAIT))
    assert result.terminal
    assert observation.terminal and not observation.success
    assert world.terminal_reason == "energy_depleted"


def test_max_steps_ends_episode():
    config = GenesisConfig(max_steps=3)
    world = make_world(config=config)
    for _ in range(2):
        observation, result = world.step(act(ActionType.WAIT))
        assert not observation.terminal
    observation, result = world.step(act(ActionType.WAIT))
    assert result.terminal and observation.terminal
    assert world.terminal_reason == "max_steps"


def test_step_after_terminal_is_rejected():
    world = make_world(energy=1)
    world.step(act(ActionType.WAIT))
    _, result = world.step(act(ActionType.WAIT))
    assert not result.success
    assert result.message == "episode already ended"
