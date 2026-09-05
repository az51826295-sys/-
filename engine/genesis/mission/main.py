"""CLI: single runs and the full pre-registered experiment."""

from __future__ import annotations

import argparse
import time

from genesis.mission.analysis.lineage import lineage_metrics
from genesis.mission.analysis.roles import (
    cluster_roles,
    context_responsiveness,
    differentiation,
)
from genesis.mission.analysis.report import (
    format_report,
    render_spec,
    run_experiment,
    save_report,
    save_results,
)
from genesis.mission.config import MissionConfig
from genesis.mission.models.gamespec import GameSpec
from genesis.mission.rounds import run_arm


def main() -> None:
    parser = argparse.ArgumentParser(prog="genesis.mission")
    parser.add_argument("--arm", choices=["A", "B", "C"], default="C")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--removal", action="store_true")
    parser.add_argument("--trait-sd", type=float, default=None)
    parser.add_argument("--experiment", action="store_true")
    parser.add_argument("--seeds", type=int, default=20)
    parser.add_argument("--agents", type=int, default=None)
    parser.add_argument("--rounds", type=int, default=None)
    parser.add_argument("--db", default="")
    parser.add_argument("--out", default="")
    parser.add_argument("--workers", type=int, default=1)
    args = parser.parse_args()

    config = MissionConfig()
    updates = {}
    if args.trait_sd is not None:
        updates["trait_sd"] = args.trait_sd
    if args.agents:
        updates["n_agents"] = args.agents
    if args.rounds:
        updates["n_rounds"] = args.rounds
    if updates:
        config = config.model_copy(update=updates)

    if args.experiment:
        seeds = list(range(1, args.seeds + 1))
        t0 = time.perf_counter()

        def progress(seed, results):
            done = time.perf_counter() - t0
            print(
                f"seed {seed}: "
                + " ".join(
                    f"{arm}={r.final_objective:.3f}" for arm, r in results.items()
                )
                + f"  [{done:.0f}s]",
                flush=True,
            )

        report, results = run_experiment(config, seeds, progress, workers=args.workers)
        print()
        print(format_report(report, config))
        if args.db:
            save_results(args.db, results)
        if args.out:
            save_report(args.out, report)
        return

    result = run_arm(args.arm, config, args.seed, removal=args.removal)
    agent_ids = [f"a{i}" for i in range(config.n_agents)]
    print(f"arm {result.arm} seed {result.seed}: "
          f"proposals={result.n_proposals} final={result.final_objective:.3f} "
          f"improvement={result.improvement:+.3f}")
    if result.removed:
        print(f"removed at midpoint: {', '.join(result.removed)}")
    if result.arm == "C":
        print(f"differentiation={differentiation(result.events, agent_ids):.3f} "
              f"responsiveness="
              f"{context_responsiveness(result.events, agent_ids, config.n_rounds):.3f}")
        roles = cluster_roles(result.events, agent_ids)
        print("roles: " + ", ".join(f"{a}:{r}" for a, r in sorted(roles.items())))
        print("lineage: " + ", ".join(
            f"{k}={v:.0f}" for k, v in lineage_metrics(result).items()))
    if result.final_spec_json:
        print()
        print(render_spec(GameSpec.model_validate_json(result.final_spec_json)))


if __name__ == "__main__":
    main()
