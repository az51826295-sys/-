"""Exact CSP by exhaustive filtering — 625 tuples, no approximation,
therefore zero judge noise (the lesson of experiment 1)."""

from __future__ import annotations

from functools import lru_cache
from itertools import product

from genesis.mission2.config import Mission2Config


@lru_cache(maxsize=4)
def _all_tuples(n_attrs: int, n_values: int) -> tuple[tuple[int, ...], ...]:
    return tuple(product(range(n_values), repeat=n_attrs))


def survivors(clues: list, config: Mission2Config) -> list[tuple[int, ...]]:
    from genesis.mission2.clues import holds

    out = []
    for t in _all_tuples(config.n_attrs, config.n_values):
        if all(holds(c, t) for c in clues):
            out.append(t)
    return out


def expected_accuracy(clues: list, config: Mission2Config) -> float:
    n = len(survivors(clues, config))
    return 1.0 / n if n else 0.0
