"""Clue predicates and the seeded instance generator.

The generator *constructs* the cooperation requirement: the full clue set
has exactly one survivor, while every agent's subset keeps at least
`min_subset_candidates` alive. Necessity is guaranteed, not assumed.
"""

from __future__ import annotations

import random
from typing import Literal

from pydantic import BaseModel, Field

from genesis.mission2.config import Mission2Config
from genesis.mission2.solver import survivors


class Clue(BaseModel):
    clue_id: str
    kind: Literal["NOT", "IS_ONE_OF", "PAIR_NOT", "IMPLIES"]
    params: dict[str, int | list[int]] = Field(default_factory=dict)


def holds(clue: Clue, t: tuple[int, ...]) -> bool:
    p = clue.params
    if clue.kind == "NOT":
        return t[p["attr"]] != p["value"]
    if clue.kind == "IS_ONE_OF":
        return t[p["attr"]] in p["values"]
    if clue.kind == "PAIR_NOT":
        return not (t[p["attr1"]] == p["value1"] and t[p["attr2"]] == p["value2"])
    if clue.kind == "IMPLIES":
        return t[p["attr1"]] != p["value1"] or t[p["attr2"]] == p["value2"]
    raise ValueError(clue.kind)


class Instance(BaseModel):
    seed: int
    truth: list[int]                  # verification only; never shown to agents
    clues: list[Clue]
    partition: list[list[str]]        # clue ids per agent


DEFAULT_KIND_MIX = ("NOT", "NOT", "IS_ONE_OF", "PAIR_NOT", "IMPLIES")


def _random_true_clue(
    rng: random.Random,
    truth: tuple[int, ...],
    config: Mission2Config,
    cid: str,
    kinds: tuple[str, ...] = DEFAULT_KIND_MIX,
) -> Clue:
    K, M = config.n_attrs, config.n_values
    kind = rng.choice(kinds)
    if kind == "NOT":
        attr = rng.randrange(K)
        value = rng.choice([v for v in range(M) if v != truth[attr]])
        return Clue(clue_id=cid, kind="NOT", params={"attr": attr, "value": value})
    if kind == "IS_ONE_OF":
        attr = rng.randrange(K)
        other = rng.choice([v for v in range(M) if v != truth[attr]])
        return Clue(
            clue_id=cid,
            kind="IS_ONE_OF",
            params={"attr": attr, "values": sorted([truth[attr], other])},
        )
    if kind == "PAIR_NOT":
        a1, a2 = rng.sample(range(K), 2)
        # exclude a pair that the truth does not have
        v1 = rng.randrange(M)
        v2 = rng.choice(
            [v for v in range(M) if not (truth[a1] == v1 and truth[a2] == v)]
        )
        return Clue(
            clue_id=cid,
            kind="PAIR_NOT",
            params={"attr1": a1, "value1": v1, "attr2": a2, "value2": v2},
        )
    a1, a2 = rng.sample(range(K), 2)
    if rng.random() < 0.5:
        v1, v2 = truth[a1], truth[a2]           # strong: fires on the truth
    else:
        v1 = rng.choice([v for v in range(M) if v != truth[a1]])
        v2 = rng.randrange(M)                   # vacuous on truth, prunes others
    return Clue(
        clue_id=cid,
        kind="IMPLIES",
        params={"attr1": a1, "value1": v1, "attr2": a2, "value2": v2},
    )


def generate_instance(
    seed: int,
    config: Mission2Config,
    kinds: tuple[str, ...] = DEFAULT_KIND_MIX,
) -> Instance:
    rng = random.Random(f"m2:{seed}")
    for _ in range(config.max_regen):
        truth = tuple(rng.randrange(config.n_values) for _ in range(config.n_attrs))
        clues: list[Clue] = []
        cid = 0

        chosen: list[Clue] = []
        current = survivors([], config)
        guard = 0
        while len(current) > 1 and guard < 500:
            guard += 1
            cid += 1
            cand = _random_true_clue(rng, truth, config, f"c{cid:03d}", kinds)
            after = [t for t in current if holds(cand, t)]
            if len(after) < len(current):
                chosen.append(cand)
                current = after
        if len(current) != 1 or list(current[0]) != list(truth):
            continue

        for _ in range(config.redundant_clues):
            cid += 1
            chosen.append(_random_true_clue(rng, truth, config, f"c{cid:03d}", kinds))

        rng.shuffle(chosen)
        partition: list[list[str]] = [[] for _ in range(config.n_agents)]
        for i, clue in enumerate(chosen):
            partition[i % config.n_agents].append(clue.clue_id)

        clue_map = {c.clue_id: c for c in chosen}
        valid = all(
            len(survivors([clue_map[cid_] for cid_ in ids], config))
            >= config.min_subset_candidates
            for ids in partition
        )
        if not valid:
            continue
        return Instance(
            seed=seed, truth=list(truth), clues=chosen, partition=partition
        )
    raise RuntimeError(f"could not generate a valid instance for seed {seed}")
