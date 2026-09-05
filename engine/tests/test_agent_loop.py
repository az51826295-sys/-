"""AgentLoop integration: full observe-predict-act-store cycles."""

from genesis.agent.loop import AgentLoop
from genesis.agent.random_agent import RandomAgent
from genesis.config import GenesisConfig
from genesis.environment.world import GenesisWorld
from genesis.memory.experience_store import ExperienceStore
from genesis.models.experience import EpisodeSummary
from genesis.world_model.naive_model import NaiveWorldModel


def build_loop(tmp_path, name="loop.db", agent_seed=0):
    config = GenesisConfig(db_path=tmp_path / name)
    store = ExperienceStore(config.db_path)
    store.initialize()
    loop = AgentLoop(
        GenesisWorld(config),
        RandomAgent(seed=agent_seed),
        NaiveWorldModel(config),
        store,
        config=config,
    )
    return loop, store


def test_episode_runs_and_saves_experiences(tmp_path):
    loop, store = build_loop(tmp_path)
    summary = loop.run_episode(seed=42)

    assert isinstance(summary, EpisodeSummary)
    assert summary.total_steps > 0
    assert summary.experiences_saved == summary.total_steps
    assert store.count() == summary.experiences_saved
    assert summary.terminal_reason in {
        "goal_reached",
        "energy_depleted",
        "max_steps",
        "step_limit",
    }
    assert summary.average_prediction_error >= 0.0

    episode_experiences = store.get_by_episode(summary.episode_id)
    assert len(episode_experiences) == summary.experiences_saved
    assert [e.step for e in episode_experiences] == list(
        range(summary.total_steps)
    )
    store.close()


def test_same_seeds_reproduce_episode(tmp_path):
    loop_a, store_a = build_loop(tmp_path, name="a.db", agent_seed=7)
    loop_b, store_b = build_loop(tmp_path, name="b.db", agent_seed=7)
    summary_a = loop_a.run_episode(seed=42)
    summary_b = loop_b.run_episode(seed=42)

    assert summary_a.total_steps == summary_b.total_steps
    assert summary_a.total_reward == summary_b.total_reward
    assert summary_a.terminal_reason == summary_b.terminal_reason
    store_a.close()
    store_b.close()


def test_max_steps_cap_is_respected(tmp_path):
    loop, store = build_loop(tmp_path)
    summary = loop.run_episode(seed=1, max_steps=5)
    assert summary.total_steps <= 5
    assert summary.experiences_saved == summary.total_steps
    store.close()
