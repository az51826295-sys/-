"""Mission-world constants, budgets, and ablation switches."""

from __future__ import annotations

from pydantic import BaseModel


class MissionConfig(BaseModel):
    # --- experiment shape ---
    n_agents: int = 6
    n_rounds: int = 20                 # total budget = n_agents * n_rounds
    seeds: int = 20                    # verification seed count

    # --- traits (ablation: trait_sd=0 -> clone population) ---
    trait_mean: float = 0.5
    trait_sd: float = 0.2
    trait_min: float = 0.05
    trait_max: float = 0.95

    # --- playouts ---
    playouts_gvr: int = 16             # greedy vs random (skill)
    playouts_gvg: int = 16             # greedy vs greedy (balance/suspense)
    max_turns: int = 120
    seconds_per_turn: float = 15.0
    close_gap: float = 1.0             # top1-top2 value gap counted as "close"
    depth_metric_enabled: bool = False # 2-ply policy (cost measured in M1)

    # --- decision ---
    softmax_temp: float = 0.5
    w_propose: float = 1.0
    w_modify: float = 1.2
    w_critique: float = 1.0
    w_simulate: float = 1.0

    # --- evaluation gates ---
    min_termination_rate: float = 0.95

    # --- objective score weights (pre-registered; sum = 1.0) ---
    w_skill: float = 0.20
    w_balance: float = 0.15
    w_choice: float = 0.15
    w_close: float = 0.10
    w_suspense: float = 0.10
    w_comeback: float = 0.05
    w_variety: float = 0.05
    w_duration: float = 0.10
    w_simplicity: float = 0.05
    w_low_draw: float = 0.05

    # --- robustness sub-experiment ---
    removal_round_fraction: float = 0.5
    removal_count: int = 2
