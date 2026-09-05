"""Scenario files: config-driven worlds beyond the two presets."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from genesis.agent.greedy_agent import GreedyAgent
from genesis.agent.loop import AgentLoop
from genesis.config import GenesisConfig, load_scenario
from genesis.environment.world import GenesisWorld
from genesis.memory.experience_store import ExperienceStore
from genesis.models.state import EntityType
from genesis.world_model.similarity_model import SimilarityWorldModel

SCENARIOS_DIR = Path(__file__).parent.parent / "scenarios"


def test_load_gauntlet_scenario():
    config = load_scenario(SCENARIOS_DIR / "gauntlet.json")
    assert config.width == 12 and config.height == 12
    assert config.num_door_sections == 3
    assert config.num_hazards == 3


def test_unknown_scenario_keys_fail_loudly(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"widht": 12}), encoding="utf-8")
    with pytest.raises(ValidationError):
        load_scenario(bad)


def test_gauntlet_map_generates_three_chains():
    config = load_scenario(SCENARIOS_DIR / "gauntlet.json")
    world = GenesisWorld(config)
    world.reset(seed=3)
    types = [e.entity_type for e in world.debug_entities().values()]
    assert types.count(EntityType.DOOR) == 3
    assert types.count(EntityType.KEY) == 3
    assert types.count(EntityType.HAZARD) == 3
    lines = world.render_text().splitlines()
    assert len(lines) == 12 and all(len(line) == 12 for line in lines)


def test_greedy_solves_gauntlet(tmp_path):
    config = load_scenario(SCENARIOS_DIR / "gauntlet.json").model_copy(
        update={"db_path": tmp_path / "gauntlet.db"}
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
    assert summary.success
    store.close()
