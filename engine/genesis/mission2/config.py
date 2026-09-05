"""Experiment 2 constants (design: docs/mission2-design.md)."""

from __future__ import annotations

from pydantic import BaseModel


class Mission2Config(BaseModel):
    n_attrs: int = 4                  # K
    n_values: int = 5                 # M -> 625 candidate tuples
    n_agents: int = 6
    min_subset_candidates: int = 20   # validity: each agent stays this ambiguous
    redundant_clues: int = 4
    share_budget_fraction: float = 0.6  # scarcity is the heart of the design
    max_regen: int = 200
