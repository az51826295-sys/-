"""AdaptiveAgent: explores what the model doesn't know, exploits what it does."""

import uuid
from datetime import datetime, timezone

from helpers import act, make_world

from genesis.agent.adaptive_agent import AdaptiveAgent
from genesis.agent.loop import AgentLoop
from genesis.config import GenesisConfig
from genesis.environment.world import GenesisWorld
from genesis.evaluation.curiosity import CuriosityScorer
from genesis.memory.experience_store import ExperienceStore
from genesis.models.action import ActionResult, ActionType
from genesis.models.experience import Experience
from genesis.models.prediction import Prediction
from genesis.world_model.similarity_model import SimilarityWorldModel

MOVEMENT = {
    ActionType.MOVE_FORWARD,
    ActionType.TURN_LEFT,
    ActionType.TURN_RIGHT,
}


def _experience_from(observation, action):
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
        result=ActionResult(success=True, reward=-0.01),
        observation_after=observation,
        prediction_error=0.0,
        created_at=datetime.now(timezone.utc),
    )


def _saturate(model, observation):
    """Make every available action in this situation well-known."""
    for action_type in observation.available_actions:
        for _ in range(3):
            model.update(_experience_from(observation, act(action_type)))


def test_fresh_model_triggers_exploration_probe():
    model = SimilarityWorldModel()
    agent = AdaptiveAgent(model, seed=0)
    observation = make_world().observe()
    chosen = agent.select_action(observation)
    score = CuriosityScorer(model).score(observation, chosen)
    assert score >= GenesisConfig().adaptive_curiosity_threshold


def test_saturated_model_follows_the_plan():
    model = SimilarityWorldModel()
    agent = AdaptiveAgent(model, seed=0)
    observation = make_world().observe()
    _saturate(model, observation)
    chosen = agent.select_action(observation)
    assert chosen.action_type in MOVEMENT


def test_low_energy_suppresses_exploration():
    model = SimilarityWorldModel()
    agent = AdaptiveAgent(model, seed=0)
    observation = make_world(energy=40).observe()  # below the reserve of 50
    chosen = agent.select_action(observation)
    assert chosen.action_type in MOVEMENT


def test_adaptive_agent_solves_multiple_seeds(tmp_path):
    for seed in (0, 1, 2, 3, 4):
        config = GenesisConfig(db_path=tmp_path / f"adaptive-{seed}.db")
        store = ExperienceStore(config.db_path)
        store.initialize()
        model = SimilarityWorldModel(config)
        agent = AdaptiveAgent(model, seed=seed, config=config)
        loop = AgentLoop(
            GenesisWorld(config), agent, model, store, config=config
        )
        summary = loop.run_episode(seed=seed)
        assert summary.success, f"seed {seed} not solved"
        store.close()


def test_trained_model_reduces_exploration(tmp_path):
    config = GenesisConfig(db_path=tmp_path / "two-visits.db")
    store = ExperienceStore(config.db_path)
    store.initialize()
    model = SimilarityWorldModel(config)
    agent = AdaptiveAgent(model, seed=3, config=config)
    loop = AgentLoop(GenesisWorld(config), agent, model, store, config=config)
    first = loop.run_episode(seed=12)
    second = loop.run_episode(seed=12)
    assert first.success and second.success
    assert second.total_steps <= first.total_steps
    store.close()
