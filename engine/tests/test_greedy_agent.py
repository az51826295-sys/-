"""GreedyAgent: the environment is solvable end-to-end from observations."""

from genesis.agent.greedy_agent import GreedyAgent
from genesis.agent.loop import AgentLoop
from genesis.config import GenesisConfig
from genesis.environment.world import GenesisWorld
from genesis.memory.experience_store import ExperienceStore
from genesis.world_model.naive_model import NaiveWorldModel


def build_loop(tmp_path, name="greedy.db", agent_seed=0):
    config = GenesisConfig(db_path=tmp_path / name)
    store = ExperienceStore(config.db_path)
    store.initialize()
    loop = AgentLoop(
        GenesisWorld(config),
        GreedyAgent(seed=agent_seed, observation_radius=config.observation_radius),
        NaiveWorldModel(config),
        store,
        config=config,
    )
    return loop, store


def test_greedy_agent_reaches_goal(tmp_path):
    loop, store = build_loop(tmp_path)
    summary = loop.run_episode(seed=42)
    assert summary.success
    assert summary.terminal_reason == "goal_reached"
    assert summary.total_reward > 0  # goal (+ button) outweigh step costs
    store.close()


def test_greedy_agent_solves_multiple_seeds(tmp_path):
    for seed in (0, 1, 2, 3, 4):
        loop, store = build_loop(tmp_path, name=f"greedy-{seed}.db", agent_seed=seed)
        summary = loop.run_episode(seed=seed)
        assert summary.success, f"seed {seed} not solved"
        assert summary.total_steps < 100  # well within the energy budget
        store.close()


def test_greedy_agent_memory_resets_between_episodes(tmp_path):
    loop, store = build_loop(tmp_path)
    first = loop.run_episode(seed=42)
    second = loop.run_episode(seed=7)  # different map; stale memory would mislead
    assert first.success and second.success
    store.close()
