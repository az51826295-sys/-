"""Advanced difficulty: chained doors, patrolling hazards, slippery moves."""

import pytest
from helpers import act, make_world

from genesis.agent.greedy_agent import GreedyAgent
from genesis.agent.loop import AgentLoop
from genesis.config import GenesisConfig
from genesis.environment.entities import make_hazard, make_wall
from genesis.environment.world import GenesisWorld
from genesis.memory.experience_store import ExperienceStore
from genesis.models.action import ActionType
from genesis.models.state import EntityType, Position
from genesis.world_model.similarity_model import SimilarityWorldModel

ADVANCED = GenesisConfig(
    num_door_sections=2,
    num_hazards=2,
    slip_probability=0.1,
    initial_energy=150,
)


def test_advanced_map_has_chained_doors_and_keys():
    world = GenesisWorld(ADVANCED)
    world.reset(seed=42)
    entities = world.debug_entities().values()
    doors = sorted(
        (e for e in entities if e.entity_type == EntityType.DOOR),
        key=lambda d: d.position.x,
    )
    keys = {e.entity_id: e for e in entities if e.entity_type == EntityType.KEY}
    hazards = [e for e in entities if e.entity_type == EntityType.HAZARD]

    assert len(doors) == 2
    assert len(keys) == 2
    assert len(hazards) == 2
    assert doors[0].key_id == "key-1" and doors[1].key_id == "key-2"
    # The chain: key-2 lies behind door-1
    assert keys["key-1"].position.x < doors[0].position.x
    assert doors[0].position.x < keys["key-2"].position.x < doors[1].position.x


def test_advanced_map_is_deterministic():
    w1, w2 = GenesisWorld(ADVANCED), GenesisWorld(ADVANCED)
    w1.reset(seed=7)
    w2.reset(seed=7)
    assert w1.render_text() == w2.render_text()


def test_certain_slip_fails_every_move():
    config = GenesisConfig(slip_probability=1.0)
    world = make_world(config=config)
    for _ in range(3):
        observation, result = world.step(act(ActionType.MOVE_FORWARD))
        assert not result.success
        assert result.message == "slipped"
    assert observation.agent_state.position == Position(x=2, y=2)


def test_hazard_patrols_and_bounces():
    hazard = make_hazard("hazard-1", Position(x=5, y=5), direction="SOUTH")
    wall = make_wall(Position(x=5, y=7))
    world = make_world([hazard, wall], agent_pos=(1, 1))
    world.step(act(ActionType.WAIT))
    assert world.debug_entities()["hazard-1"].position == Position(x=5, y=6)
    world.step(act(ActionType.WAIT))  # blocked by the wall: reverses
    assert world.debug_entities()["hazard-1"].direction == "NORTH"
    world.step(act(ActionType.WAIT))
    assert world.debug_entities()["hazard-1"].position == Position(x=5, y=5)


def test_hazard_contact_damages_agent():
    config = GenesisConfig(num_hazards=0)  # explicit world below
    hazard = make_hazard("hazard-1", Position(x=2, y=3), direction="NORTH")
    world = make_world([hazard], agent_pos=(2, 2), config=config)
    observation, result = world.step(act(ActionType.WAIT))
    assert result.metadata.get("hazard_hits") == 1
    assert result.reward == pytest.approx(
        config.step_reward + config.hazard_reward_penalty
    )
    # 1 step cost + hazard damage
    assert observation.agent_state.energy == 100 - 1 - config.hazard_energy_damage


def test_greedy_agent_solves_chained_map(tmp_path):
    for seed in (0, 1, 2):
        config = GenesisConfig(
            db_path=tmp_path / f"chain-{seed}.db",
            num_door_sections=2,
            initial_energy=150,
        )
        store = ExperienceStore(config.db_path)
        store.initialize()
        loop = AgentLoop(
            GenesisWorld(config),
            GreedyAgent(seed=seed),
            SimilarityWorldModel(config),
            store,
            config=config,
        )
        summary = loop.run_episode(seed=seed)
        assert summary.success, f"seed {seed} not solved"
        store.close()


def test_slippery_world_restores_prediction_error(tmp_path):
    config = GenesisConfig(
        db_path=tmp_path / "slip.db",
        num_door_sections=2,
        num_hazards=2,
        slip_probability=0.1,
        initial_energy=150,
    )
    store = ExperienceStore(config.db_path)
    store.initialize()
    loop = AgentLoop(
        GenesisWorld(config),
        GreedyAgent(seed=0),
        SimilarityWorldModel(config),
        store,
        config=config,
    )
    summary = loop.run_episode(seed=0)
    assert summary.average_prediction_error > 0.0
    store.close()
