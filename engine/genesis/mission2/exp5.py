"""Experiment 5 — I-v2: descending-threshold yield protocol with
experience-tuned thresholds (docs/mission5-design.md).

No coordinator. Each agent knows only its own clues plus the public
board; realized gains are public, so everyone's statistics are honest
observations. The learned state is the society's shared experience.
"""

from __future__ import annotations

import math
import random
import statistics

from pydantic import BaseModel, Field

from genesis.mission2.clues import Instance
from genesis.mission2.config import Mission2Config
from genesis.mission2.exp3 import _Run, run_central, tier_instance
from genesis.mission2.exp4 import min_certificate
from genesis.mission2.groups import _best_accuracy
from genesis.mission2.solver import survivors

SLACKS5 = (1.25, 1.5, 2.0)
TRAIN_SEEDS = list(range(1001, 1031))

COLD_THRESHOLDS = {"tight": 0.5, "mid": 0.25, "loose": 0.1}
QUANTILES = {"tight": 0.75, "mid": 0.5, "loose": 0.25}
PRIOR_LOG_STEP = 0.7          # prior: each share roughly halves candidates
RELAX = 0.6
MAX_PASSES = 6


class SocietyStats(BaseModel):
    """The society's accumulated public experience."""

    gains: list[float] = Field(default_factory=list)      # realized r per share
    log_steps: list[float] = Field(default_factory=list)  # ln(base/after)

    def mean_log_step(self) -> float:
        return statistics.fmean(self.log_steps) if self.log_steps else PRIOR_LOG_STEP

    def threshold(self, bucket: str) -> float:
        if len(self.gains) < 5:
            return COLD_THRESHOLDS[bucket]
        ordered = sorted(self.gains)
        q = QUANTILES[bucket]
        return ordered[min(len(ordered) - 1, int(q * len(ordered)))]

    def observe(self, base: int, after: int) -> None:
        if base > 0:
            self.gains.append(1.0 - after / base)
            if after > 0:
                self.log_steps.append(math.log(base / after))


def _bucket(est_slack: float) -> str:
    if est_slack < 1.3:
        return "tight"
    if est_slack < 2.0:
        return "mid"
    return "loose"


class I2Result(BaseModel):
    seed: int
    slack: float
    expected_accuracy: float
    solved: bool
    shares_used: int
    rounds_to_unique: int = -1
    fidelity: float = 0.0        # shares matching the global-best reduction
    forced_shares: int = 0       # shares that happened only via max-relaxation


def run_i2(
    instance: Instance,
    config: Mission2Config,
    budget: int,
    stats: SocietyStats,
    learn: bool,
    salt: int = 0,
) -> I2Result:
    rng = random.Random(f"m5:{instance.seed}:{salt}")
    run = _Run(instance, config, budget)
    faithful = 0
    forced = 0

    while run.shares < run.budget and not run.done:
        agents = run.active_agents()
        if not agents:
            break
        base = len(survivors(run.board, config))
        if base <= 1:
            break
        # telemetry only (agents never see this): the global best reduction
        global_after = min(run.local_best(ai)[1] for ai in agents)

        est_needed = max(1.0, math.log(max(base, 2)) / stats.mean_log_step())
        est_slack = (run.budget - run.shares) / est_needed
        tau = stats.threshold(_bucket(est_slack))

        speaker = None
        was_forced = False
        for _ in range(MAX_PASSES):
            order = list(agents)
            rng.shuffle(order)
            for ai in order:
                clue, after = run.local_best(ai)
                r = 1.0 - after / base
                if r >= tau:
                    speaker = (ai, clue, after)
                    break
            if speaker:
                break
            tau *= RELAX
        if speaker is None:  # total relaxation failed: forced share
            ai = order[0]
            clue, after = run.local_best(ai)
            speaker = (ai, clue, after)
            was_forced = True

        _, clue, after = speaker
        if after == global_after:
            faithful += 1
        if was_forced:
            forced += 1
        run.commit(clue)
        if learn:
            stats.observe(base, after)

    acc = _best_accuracy(run.board, run.agent_clues, config)
    return I2Result(
        seed=instance.seed, slack=0.0,
        expected_accuracy=acc, solved=acc == 1.0,
        shares_used=run.shares, rounds_to_unique=run.rounds_to_unique,
        fidelity=faithful / run.shares if run.shares else 0.0,
        forced_shares=forced,
    )


def run_c_with_fidelity(
    instance: Instance, config: Mission2Config, budget: int, salt: int = 0
) -> I2Result:
    """C rebuilt with the fidelity telemetry for a fair mechanism metric."""
    rng = random.Random(f"m5c:{instance.seed}:{salt}")
    run = _Run(instance, config, budget)
    faithful = 0

    while run.shares < run.budget and not run.done:
        agents = run.active_agents()
        if not agents:
            break
        rng.shuffle(agents)
        for ai in agents:
            if run.shares >= run.budget or run.done:
                break
            base = len(survivors(run.board, config))
            if base <= 1:
                break
            global_after = min(
                run.local_best(a)[1] for a in run.active_agents()
            )
            clue, after = run.local_best(ai)
            if after == global_after:
                faithful += 1
            run.commit(clue)

    acc = _best_accuracy(run.board, run.agent_clues, config)
    return I2Result(
        seed=instance.seed, slack=0.0,
        expected_accuracy=acc, solved=acc == 1.0,
        shares_used=run.shares, rounds_to_unique=run.rounds_to_unique,
        fidelity=faithful / run.shares if run.shares else 0.0,
    )


def train_society(config: Mission2Config) -> tuple[SocietyStats, list[float]]:
    """Online training across instances, slack levels cycled."""
    stats = SocietyStats()
    curve: list[float] = []
    for i, seed in enumerate(TRAIN_SEEDS):
        instance = tier_instance(seed, config, "medium")
        cert, _ = min_certificate(instance, config)
        slack = SLACKS5[i % len(SLACKS5)]
        budget = max(1, round(slack * cert))
        result = run_i2(instance, config, budget, stats, learn=True)
        curve.append(result.expected_accuracy)
    return stats, curve
