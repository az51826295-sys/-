"""Console entry point: python -m genesis.main [--episodes N] [--seed S] [--verbose]"""

from __future__ import annotations

import argparse
import uuid
from datetime import datetime, timezone

from genesis.agent.adaptive_agent import AdaptiveAgent
from genesis.agent.curious_agent import CuriousAgent
from genesis.agent.greedy_agent import GreedyAgent
from genesis.agent.loop import AgentLoop
from genesis.agent.random_agent import RandomAgent
from pathlib import Path

from genesis.config import GenesisConfig, load_scenario
from genesis.environment.world import GenesisWorld
from genesis.evaluation.report import build_learning_report
from genesis.memory.episode_store import EpisodeStore
from genesis.memory.experience_store import ExperienceStore
from genesis.memory.snapshot_store import SnapshotStore
from genesis.models.experience import EpisodeRecord
from genesis.world_model.naive_model import NaiveWorldModel
from genesis.world_model.similarity_model import SimilarityWorldModel


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m genesis.main",
        description="Run Genesis MVP episodes.",
    )
    parser.add_argument(
        "--episodes", type=int, default=1, help="number of episodes to run"
    )
    parser.add_argument(
        "--seed", type=int, default=None, help="base seed (episode i uses seed+i)"
    )
    parser.add_argument(
        "--verbose", action="store_true", help="log every step"
    )
    parser.add_argument(
        "--difficulty",
        choices=["basic", "advanced"],
        default="basic",
        help=(
            "basic: one key/door; advanced: chained keys and doors, "
            "patrolling hazards, and slippery movement"
        ),
    )
    parser.add_argument(
        "--scenario",
        type=Path,
        default=None,
        help=(
            "JSON file of GenesisConfig fields (see scenarios/); "
            "overrides --difficulty"
        ),
    )
    parser.add_argument(
        "--report",
        action="store_true",
        help="print the learning report from recorded episodes and exit",
    )
    parser.add_argument(
        "--model",
        choices=["similarity", "naive"],
        default="similarity",
        help=(
            "world model: similarity retrieval over past experiences "
            "(default) or exact-state-key statistics"
        ),
    )
    parser.add_argument(
        "--agent",
        choices=["random", "greedy", "curious", "adaptive"],
        default="random",
        help=(
            "random walker, observation-driven goal seeker, "
            "curiosity-driven explorer, or adaptive explore/exploit"
        ),
    )
    return parser


def config_for_difficulty(difficulty: str) -> GenesisConfig:
    if difficulty == "advanced":
        return GenesisConfig(
            num_door_sections=2,
            num_hazards=2,
            hazard_energy_damage=15,
            hazard_reward_penalty=-1.0,
            slip_probability=0.1,
            initial_energy=150,
        )
    return GenesisConfig()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.scenario is not None:
        config = load_scenario(args.scenario)
        difficulty_label = args.scenario.stem
    else:
        config = config_for_difficulty(args.difficulty)
        difficulty_label = args.difficulty

    if args.report:
        experience_store = ExperienceStore(config.db_path)
        experience_store.initialize()
        episode_store = EpisodeStore(config.db_path)
        episode_store.initialize()
        try:
            print(
                build_learning_report(
                    episode_store.get_all(), experience_store.count()
                )
            )
        finally:
            episode_store.close()
            experience_store.close()
        return 0

    print("Genesis MVP")
    print(
        f"  world: {config.width}x{config.height},"
        f" energy={config.initial_energy}, max_steps={config.max_steps}"
    )
    print(
        f"  agent: {args.agent}, world model: {args.model},"
        f" difficulty: {difficulty_label}"
    )
    print(f"  episodes: {args.episodes}, seed: {args.seed}")
    print(f"  database: {config.db_path}")

    store = ExperienceStore(config.db_path)
    store.initialize()
    episode_store = EpisodeStore(config.db_path)
    episode_store.initialize()
    run_id = uuid.uuid4().hex[:8]
    world = GenesisWorld(config)
    if args.model == "naive":
        world_model = NaiveWorldModel(config)
    else:
        world_model = SimilarityWorldModel(config)
    snapshot_store = SnapshotStore(config.db_path)
    snapshot_store.initialize()
    snapshot = snapshot_store.load(args.model)
    snapshot_rowid = 0
    if snapshot is not None:
        world_model.load_state(snapshot.state_json)
        snapshot_rowid = snapshot.last_rowid
    replayed = world_model.rehydrate(store.iter_since(snapshot_rowid))
    if snapshot is not None:
        print(
            f"  world model: snapshot (through experience {snapshot_rowid})"
            f" + {replayed} newer experiences"
        )
    else:
        print(f"  world model rehydrated from {replayed} stored experiences")
    print()
    if args.agent == "greedy":
        agent = GreedyAgent(
            seed=args.seed, observation_radius=config.observation_radius
        )
    elif args.agent == "curious":
        agent = CuriousAgent(world_model, seed=args.seed, config=config)
    elif args.agent == "adaptive":
        agent = AdaptiveAgent(
            world_model,
            seed=args.seed,
            observation_radius=config.observation_radius,
            config=config,
        )
    else:
        agent = RandomAgent(seed=args.seed)
    loop = AgentLoop(
        world, agent, world_model, store, config=config, verbose=args.verbose
    )

    successes = 0
    summaries = []
    try:
        for i in range(args.episodes):
            episode_seed = None if args.seed is None else args.seed + i
            summary = loop.run_episode(seed=episode_seed)
            summaries.append(summary)
            successes += 1 if summary.success else 0
            episode_store.save(
                EpisodeRecord(
                    episode_id=summary.episode_id,
                    run_id=run_id,
                    agent=args.agent,
                    model=args.model,
                    difficulty=difficulty_label,
                    world_seed=episode_seed,
                    total_steps=summary.total_steps,
                    total_reward=summary.total_reward,
                    success=summary.success,
                    terminal_reason=summary.terminal_reason,
                    average_prediction_error=summary.average_prediction_error,
                    experiences_saved=summary.experiences_saved,
                    hazard_hits=summary.hazard_hits,
                    created_at=datetime.now(timezone.utc),
                )
            )
            print(f"Episode {i + 1}/{args.episodes}: {summary.episode_id}")
            print(f"  steps: {summary.total_steps}")
            print(f"  total reward: {summary.total_reward:.2f}")
            print(
                f"  outcome: "
                f"{'SUCCESS' if summary.success else 'FAILURE'}"
                f" ({summary.terminal_reason})"
            )
            print(
                "  average prediction error: "
                f"{summary.average_prediction_error:.3f}"
            )
            print(f"  experiences saved: {summary.experiences_saved}")
            print()

        print(f"Episodes succeeded: {successes}/{args.episodes}")
        if len(summaries) > 1:
            trend = " -> ".join(
                f"{s.average_prediction_error:.3f}" for s in summaries
            )
            print(f"Prediction error by episode: {trend}")
        print(f"Total experiences stored: {store.count()}")
        print(f"Episodes recorded: {episode_store.count()}")
        print("Learning report: python -m genesis.main --report")
        snapshot_store.save(
            args.model, store.max_rowid(), world_model.dump_state()
        )
    finally:
        snapshot_store.close()
        episode_store.close()
        store.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
