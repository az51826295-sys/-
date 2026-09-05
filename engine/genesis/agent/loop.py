"""AgentLoop: observe -> predict -> act -> compare -> store -> update."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from genesis.agent.base import BaseAgent
from genesis.config import GenesisConfig
from genesis.environment.world import GenesisWorld
from genesis.evaluation.metrics import compute_prediction_error
from genesis.memory.experience_store import ExperienceStore
from genesis.models.experience import EpisodeSummary, Experience
from genesis.world_model.naive_model import NaiveWorldModel


class AgentLoop:
    def __init__(
        self,
        world: GenesisWorld,
        agent: BaseAgent,
        world_model: NaiveWorldModel,
        store: ExperienceStore,
        config: GenesisConfig | None = None,
        verbose: bool = False,
    ):
        self.world = world
        self.agent = agent
        self.world_model = world_model
        self.store = store
        self.config = config or GenesisConfig()
        self.verbose = verbose

    def run_episode(
        self,
        seed: int | None = None,
        max_steps: int | None = None,
    ) -> EpisodeSummary:
        observation = self.world.reset(seed=seed)
        step_cap = max_steps if max_steps is not None else self.config.max_steps

        total_reward = 0.0
        errors: list[float] = []
        saved = 0
        hazard_hits = 0

        if self.verbose:
            print(f"Episode: {observation.episode_id}")
            print(self.world.render_text())

        while (
            not observation.terminal
            and observation.agent_state.step_count < step_cap
        ):
            action = self.agent.select_action(observation)
            prediction = self.world_model.predict(observation, action)
            observation_after, result = self.world.step(action)
            error = compute_prediction_error(
                prediction, result, observation_after, self.config
            )

            experience = Experience(
                experience_id=uuid.uuid4().hex[:16],
                episode_id=observation.episode_id,
                step=observation.step,
                observation_before=observation,
                action=action,
                prediction=prediction,
                result=result,
                observation_after=observation_after,
                prediction_error=error,
                created_at=datetime.now(timezone.utc),
            )
            self.store.save(experience)
            self.world_model.update(experience)
            saved += 1
            total_reward += result.reward
            errors.append(error)
            hazard_hits += int(result.metadata.get("hazard_hits", 0))

            if self.verbose:
                self._log_step(observation, action, prediction, result, error)

            observation = observation_after

        terminal_reason = self.world.terminal_reason or "step_limit"
        return EpisodeSummary(
            episode_id=observation.episode_id,
            total_steps=observation.agent_state.step_count,
            total_reward=round(total_reward, 4),
            success=self.world.success,
            terminal_reason=terminal_reason,
            average_prediction_error=(
                round(sum(errors) / len(errors), 4) if errors else 0.0
            ),
            experiences_saved=saved,
            hazard_hits=hazard_hits,
        )

    @staticmethod
    def _log_step(observation, action, prediction, result, error) -> None:
        agent = observation.agent_state
        print(f"Step {agent.step_count + 1}")
        print(
            f"  Observation: position=({agent.position.x}, {agent.position.y}),"
            f" facing={agent.orientation.value}"
        )
        print(f"  Action: {action.action_type.value}")
        print(
            f"  Prediction: success={prediction.predicted_success},"
            f" confidence={prediction.confidence:.2f}"
        )
        print(
            f"  Result: success={result.success}, reward={result.reward:.2f}"
            f" ({result.message})"
        )
        print(f"  Prediction error: {error:.2f}")
