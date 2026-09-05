"""The four comparison groups (design 2).

Scarcity rule: C and D get the same share budget = 60% of the distinct
clues. What differs is only *how the next clue to share is chosen*:
C = each agent's local greedy information gain, D = blind round-robin.
"""

from __future__ import annotations

import math
import random

from pydantic import BaseModel, Field

from genesis.mission2.clues import Instance
from genesis.mission2.config import Mission2Config
from genesis.mission2.solver import survivors


class GroupResult(BaseModel):
    group: str
    seed: int
    expected_accuracy: float
    solved: bool
    shares_used: int = 0
    share_budget: int = 0
    rounds_to_unique: int = -1        # share count at which |S| hit 1
    waste_rate: float = 0.0           # shares that reduced nothing
    coverage: float = 0.0             # fraction of clues on the board at end
    top3_contribution: float = 0.0    # share of total reduction from top 3
    trajectory: list[float] = Field(default_factory=list)


def _best_accuracy(
    board: list, agent_clues: list[list], config: Mission2Config
) -> float:
    best = 0.0
    for own in agent_clues:
        n = len(survivors(board + own, config))
        if n:
            best = max(best, 1.0 / n)
    return best


def run_group(
    group: str, instance: Instance, config: Mission2Config, order_salt: int = 0
) -> GroupResult:
    clue_map = {c.clue_id: c for c in instance.clues}
    agent_clues = [[clue_map[cid] for cid in ids] for ids in instance.partition]
    budget = math.floor(config.share_budget_fraction * len(instance.clues))

    if group == "A":
        n = len(survivors(instance.clues, config))
        acc = 1.0 / n
        return GroupResult(
            group="A", seed=instance.seed, expected_accuracy=acc,
            solved=acc == 1.0, share_budget=budget,
        )

    if group == "B":
        acc = _best_accuracy([], agent_clues, config)
        return GroupResult(
            group="B", seed=instance.seed, expected_accuracy=acc,
            solved=acc == 1.0, share_budget=budget,
        )

    assert group in ("C", "D", "E")
    rng = random.Random(f"m2:{instance.seed}:{group}:{order_salt}")
    board: list = []
    board_ids: set[str] = set()
    shares = 0
    wasted = 0
    trajectory: list[float] = []
    reductions: list[int] = []
    rounds_to_unique = -1
    done = False

    def commit(choice, base: int) -> None:
        nonlocal shares, wasted, rounds_to_unique, done
        board.append(choice)
        board_ids.add(choice.clue_id)
        shares += 1
        after = len(survivors(board, config))
        reductions.append(base - after)
        if after >= base:
            wasted += 1
        acc = _best_accuracy(board, agent_clues, config)
        trajectory.append(acc)
        if acc == 1.0:
            # evaluator v2: the task is done once the answer is certain;
            # further shares would only pollute the efficiency metrics
            done = True
            if rounds_to_unique < 0:
                rounds_to_unique = shares

    exhausted = False
    while shares < budget and not exhausted and not done:
        if group == "E":
            # smart designed procedure: central info-gain scheduler picks
            # the globally best next share (agents report local numbers)
            candidates = [
                c
                for ai in range(config.n_agents)
                for c in agent_clues[ai]
                if c.clue_id not in board_ids
            ]
            if not candidates:
                exhausted = True
                continue
            base = len(survivors(board, config))
            choice = min(
                candidates,
                key=lambda c: (len(survivors(board + [c], config)), c.clue_id),
            )
            commit(choice, base)
            continue
        order = list(range(config.n_agents))
        if group == "C":
            rng.shuffle(order)
        progressed = False
        for ai in order:
            if shares >= budget or done:
                break
            own_unshared = [
                c for c in agent_clues[ai] if c.clue_id not in board_ids
            ]
            if not own_unshared:
                continue
            base = len(survivors(board, config))
            if group == "C":
                # local greedy info gain: public board + one own clue
                choice = min(
                    own_unshared,
                    key=lambda c: (len(survivors(board + [c], config)), c.clue_id),
                )
            else:
                choice = own_unshared[0]
            commit(choice, base)
            progressed = True
        if not progressed:
            exhausted = True

    acc = _best_accuracy(board, agent_clues, config)
    total_reduction = sum(reductions)
    top3 = sum(sorted(reductions, reverse=True)[:3])
    return GroupResult(
        group=group, seed=instance.seed, expected_accuracy=acc,
        solved=acc == 1.0, shares_used=shares, share_budget=budget,
        rounds_to_unique=rounds_to_unique,
        waste_rate=wasted / shares if shares else 0.0,
        coverage=len(board_ids) / len(instance.clues),
        top3_contribution=top3 / total_reduction if total_reduction else 0.0,
        trajectory=trajectory,
    )
