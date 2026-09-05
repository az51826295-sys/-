"""Curiosity scoring and the curiosity-driven agent."""

import uuid
from datetime import datetime, timezone

from helpers import act, make_world

from genesis.agent.curious_agent import CuriousAgent
from genesis.agent.loop import AgentLoop
from genesis.config import GenesisConfig
from genesis.environment.world import GenesisWorld
from genesis.evaluation.curiosity import CuriosityScorer
from genesis.memory.experience_store import ExperienceStore
from genesis.models.action import ActionResult, ActionType
from genesis.models.experience import Experience
from genesis.models.prediction import Prediction
from genesis.world_model.naive_model import NaiveWorldModel


def _experience_from(observation, action, success=True, error=0.0):
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
        result=ActionResult(success=success, reward=-0.01),
        observation_after=observation,
        prediction_error=error,
        created_at=datetime.now(timezone.utc),
    )


def test_unseen_action_scores_higher_than_seen():
    model = NaiveWorldModel()
    observation = make_world().observe()
    seen = act(ActionType.MOVE_FORWARD)
    for _ in range(3):
        model.update(_experience_from(observation, seen))

    scorer = CuriosityScorer(model)
    assert scorer.score(observation, act(ActionType.TURN_LEFT)) > scorer.score(
        observation, seen
    )


def test_mispredicted_situations_stay_interesting():
    model = NaiveWorldModel()
    observation = make_world().observe()
    surprising = act(ActionType.MOVE_FORWARD)
    boring = act(ActionType.TURN_LEFT)
    for _ in range(5):
        model.update(_experience_from(observation, surprising, error=2.0))
        model.update(_experience_from(observation, boring, error=0.0))

    scorer = CuriosityScorer(model)
    assert scorer.score(observation, surprising) > scorer.score(
        observation, boring
    )


def test_curious_agent_avoids_well_known_action():
    model = NaiveWorldModel()
    observation = make_world().observe()
    for _ in range(5):
        model.update(
            _experience_from(observation, act(ActionType.MOVE_FORWARD))
        )

    agent = CuriousAgent(model, seed=0)
    for _ in range(10):
        chosen = agent.select_action(observation)
        assert chosen.action_type != ActionType.MOVE_FORWARD


def test_curious_agent_explores_diverse_actions(tmp_path):
    config = GenesisConfig(db_path=tmp_path / "curious.db")
    store = ExperienceStore(config.db_path)
    store.initialize()
    model = NaiveWorldModel(config)
    agent = CuriousAgent(model, seed=0, config=config)
    loop = AgentLoop(GenesisWorld(config), agent, model, store, config=config)

    summary = loop.run_episode(seed=42)
    experiences = store.get_by_episode(summary.episode_id)
    tried = {e.action.action_type for e in experiences}
    assert len(tried) >= 5
    store.close()
