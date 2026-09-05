"""Experiment 3 variants: when does central selection break down, and can
a distributed system rebuild the function? (docs/mission3-design.md)

Distortions (F, G) affect only *which agent speaks* — the spoken clue is
always that agent's honest local best. E-decap kills the coordinator at
half budget. I replaces exact local computation with values learned from
retrospective leave-one-out credit on past episodes.
"""

from __future__ import annotations

import math
import random
from collections import defaultdict

from pydantic import BaseModel

from genesis.mission2.clues import DEFAULT_KIND_MIX, Instance, generate_instance
from genesis.mission2.config import Mission2Config
from genesis.mission2.groups import _best_accuracy
from genesis.mission2.solver import survivors

TIERS: dict[str, tuple[str, ...]] = {
    "easy": ("NOT", "IS_ONE_OF"),
    "medium": DEFAULT_KIND_MIX,
    "hard": ("PAIR_NOT", "IMPLIES"),
}

TRAIN_SEED_BASE = 1000


class VariantResult(BaseModel):
    variant: str
    tier: str
    seed: int
    expected_accuracy: float
    solved: bool
    shares_used: int
    share_budget: int
    rounds_to_unique: int = -1
    report_error_mean: float = 0.0     # F/G: |reported - true| / true
    criticals_missed: int = 0


def tier_instance(seed: int, config: Mission2Config, tier: str) -> Instance:
    return generate_instance(seed, config, TIERS[tier])


def critical_ids(instance: Instance, config: Mission2Config) -> set[str]:
    """Clues whose removal from the FULL set breaks uniqueness. A solved
    board provably contains all of them; missing ones imply failure."""
    out = set()
    for c in instance.clues:
        rest = [x for x in instance.clues if x.clue_id != c.clue_id]
        if len(survivors(rest, config)) > 1:
            out.add(c.clue_id)
    return out


class _Run:
    """Shared bookkeeping for every variant loop."""

    def __init__(
        self,
        instance: Instance,
        config: Mission2Config,
        budget: int | None = None,
    ):
        self.instance = instance
        self.config = config
        clue_map = {c.clue_id: c for c in instance.clues}
        self.agent_clues = [
            [clue_map[cid] for cid in ids] for ids in instance.partition
        ]
        self.budget = (
            budget
            if budget is not None
            else math.floor(config.share_budget_fraction * len(instance.clues))
        )
        self.board: list = []
        self.board_ids: set[str] = set()
        self.shares = 0
        self.rounds_to_unique = -1
        self.done = False

    def unshared(self, ai: int) -> list:
        return [c for c in self.agent_clues[ai] if c.clue_id not in self.board_ids]

    def local_best(self, ai: int) -> tuple:
        """(clue, resulting survivor count) — exact local greedy."""
        own = self.unshared(ai)
        best = min(
            own,
            key=lambda c: (len(survivors(self.board + [c], self.config)), c.clue_id),
        )
        return best, len(survivors(self.board + [best], self.config))

    def commit(self, clue) -> None:
        self.board.append(clue)
        self.board_ids.add(clue.clue_id)
        self.shares += 1
        if _best_accuracy(self.board, self.agent_clues, self.config) == 1.0:
            self.done = True
            if self.rounds_to_unique < 0:
                self.rounds_to_unique = self.shares

    def active_agents(self) -> list[int]:
        return [ai for ai in range(self.config.n_agents) if self.unshared(ai)]

    def result(
        self, variant: str, tier: str, errors: list[float] | None = None
    ) -> VariantResult:
        acc = _best_accuracy(self.board, self.agent_clues, self.config)
        crits = critical_ids(self.instance, self.config)
        # "ignored critical clues" are measured against what the best-placed
        # agent could see: the public board plus its own hand. A solved run
        # provably has zero (the union achieving uniqueness must hold them).
        best_view: set[str] = set()
        best_n = None
        for own in self.agent_clues:
            n = len(survivors(self.board + own, self.config))
            if best_n is None or n < best_n:
                best_n = n
                best_view = self.board_ids | {c.clue_id for c in own}
        return VariantResult(
            variant=variant, tier=tier, seed=self.instance.seed,
            expected_accuracy=acc, solved=acc == 1.0,
            shares_used=self.shares, share_budget=self.budget,
            rounds_to_unique=self.rounds_to_unique,
            report_error_mean=(
                sum(errors) / len(errors) if errors else 0.0
            ),
            criticals_missed=len(crits - best_view),
        )


def run_central(
    instance: Instance,
    config: Mission2Config,
    tier: str,
    variant: str,           # "E" | "F" | "G"
    sigma: float = 0.0,
    salt: int = 0,
    budget: int | None = None,
) -> VariantResult:
    rng = random.Random(f"m3:{instance.seed}:{tier}:{variant}:{sigma}:{salt}")
    run = _Run(instance, config, budget)
    errors: list[float] = []
    bias = [0.5 if ai % 2 == 0 else 2.0 for ai in range(config.n_agents)]

    while run.shares < run.budget and not run.done:
        agents = run.active_agents()
        if not agents:
            break
        reports = {}
        choices = {}
        for ai in agents:
            clue, true_count = run.local_best(ai)
            choices[ai] = clue
            if variant == "F":
                reported = max(1.0, true_count * math.exp(rng.gauss(0.0, sigma)))
            elif variant == "G":
                reported = true_count * bias[ai]
            else:
                reported = float(true_count)
            reports[ai] = reported
            if true_count:
                errors.append(abs(reported - true_count) / true_count)
        speaker = min(agents, key=lambda ai: (reports[ai], ai))
        run.commit(choices[speaker])

    label = f"F{sigma}" if variant == "F" else variant
    return run.result(label, tier, errors)


def run_decap(
    instance: Instance,
    config: Mission2Config,
    tier: str,
    salt: int = 0,
    budget: int | None = None,
) -> VariantResult:
    """E until half budget, then the coordinator dies -> C for the rest."""
    rng = random.Random(f"m3:{instance.seed}:{tier}:decap:{salt}")
    run = _Run(instance, config, budget)
    half = run.budget // 2

    while run.shares < half and not run.done:
        agents = run.active_agents()
        if not agents:
            break
        best_ai = min(agents, key=lambda ai: (run.local_best(ai)[1], ai))
        run.commit(run.local_best(best_ai)[0])

    while run.shares < run.budget and not run.done:
        agents = run.active_agents()
        if not agents:
            break
        rng.shuffle(agents)
        for ai in agents:
            if run.shares >= run.budget or run.done:
                break
            run.commit(run.local_best(ai)[0])

    return run.result("Edecap", tier)


def run_voting(
    instance: Instance, config: Mission2Config, tier: str, salt: int = 0
) -> VariantResult:
    """H: no coordinator; agents vote for whoever's past shares reduced the
    most (public reputation), plurality speaks its own local best."""
    run = _Run(instance, config)
    reputation = [0.0] * config.n_agents

    while run.shares < run.budget and not run.done:
        agents = run.active_agents()
        if not agents:
            break
        speaker = max(agents, key=lambda ai: (reputation[ai], -ai))
        before = len(survivors(run.board, config))
        clue, after = run.local_best(speaker)
        run.commit(clue)
        reputation[speaker] += before - after

    return run.result("H", tier)


# ------------------------------------------------------------------ I: 학습


def clue_feature(clue) -> tuple:
    return (clue.kind, clue.params.get("attr", clue.params.get("attr1", -1)))


def run_learned(
    instance: Instance,
    config: Mission2Config,
    tier: str,
    scores: dict[tuple, float],
    salt: int = 0,
) -> tuple[VariantResult, list]:
    """I: decentralized like C, but clue choice uses learned feature values
    instead of exact computation."""
    rng = random.Random(f"m3:{instance.seed}:{tier}:I:{salt}")
    run = _Run(instance, config)

    while run.shares < run.budget and not run.done:
        agents = run.active_agents()
        if not agents:
            break
        rng.shuffle(agents)
        for ai in agents:
            if run.shares >= run.budget or run.done:
                break
            own = run.unshared(ai)
            if not own:
                continue
            choice = max(
                own, key=lambda c: (scores.get(clue_feature(c), 0.0), c.clue_id)
            )
            run.commit(choice)

    return run.result("I", tier), run.board


def train_learned(
    config: Mission2Config, tier: str, episodes: int = 30
) -> tuple[dict[tuple, float], list[float]]:
    """Sequential episodes; credit = retrospective leave-one-out reduction
    on the final board (non-myopic: rewards clues that mattered in the end)."""
    sums: dict[tuple, float] = defaultdict(float)
    counts: dict[tuple, int] = defaultdict(int)
    curve: list[float] = []
    for ep in range(episodes):
        instance = tier_instance(TRAIN_SEED_BASE + ep + 1, config, tier)
        scores = {
            k: sums[k] / counts[k] for k in sums if counts[k]
        }
        result, board = run_learned(instance, config, tier, scores)
        curve.append(result.expected_accuracy)
        final_n = len(survivors(board, config))
        for c in board:
            rest = [x for x in board if x.clue_id != c.clue_id]
            credit = len(survivors(rest, config)) - final_n
            key = clue_feature(c)
            sums[key] += credit
            counts[key] += 1
    return {k: sums[k] / counts[k] for k in sums if counts[k]}, curve


def run_free(
    instance: Instance, config: Mission2Config, tier: str, salt: int = 0
) -> VariantResult:
    """C inside experiment 3: decentralized exact local greedy (same
    algorithm as mission2's group C, rebuilt on _Run so the board and
    criticals are observable)."""
    rng = random.Random(f"m3:{instance.seed}:{tier}:C:{salt}")
    run = _Run(instance, config)

    while run.shares < run.budget and not run.done:
        agents = run.active_agents()
        if not agents:
            break
        rng.shuffle(agents)
        for ai in agents:
            if run.shares >= run.budget or run.done:
                break
            run.commit(run.local_best(ai)[0])

    return run.result("C", tier)
