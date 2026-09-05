"""M1: the interpreter plays real games; playouts are deterministic."""

from __future__ import annotations

import random
import time

from genesis.mission.config import MissionConfig
from genesis.mission.engine.interpreter import (
    GameState,
    apply_move,
    legal_moves,
    score,
)
from genesis.mission.engine.playout import evaluate_spec, run_playout
from genesis.mission.engine.policies import GreedyPolicy, RandomPolicy
from genesis.mission.engine.static_check import dynamic_issues, static_issues
from genesis.mission.models import (
    ActionKind,
    BoardSpec,
    EndKind,
    GameSpec,
    ScoringKind,
    ScoringRule,
    TurnAction,
    WinKind,
)


def surround_game() -> GameSpec:
    """Handcrafted known-good game: place, move, capture; capture scoring."""
    return GameSpec(
        spec_id="surround",
        name="4x4 포위전",
        board=BoardSpec(width=4, height=4),
        tokens_per_player=6,
        actions=[
            TurnAction(kind=ActionKind.PLACE),
            TurnAction(kind=ActionKind.MOVE, params={"distance": 1}),
            TurnAction(kind=ActionKind.CAPTURE, params={"flanked": 0}),
        ],
        scoring=[
            ScoringRule(kind=ScoringKind.CAPTURED, params={"points": 1}),
            ScoringRule(kind=ScoringKind.AREA_MAJORITY, params={"points": 1}),
        ],
        win=WinKind.MOST_AT_END,
        end=EndKind.ROUNDS,
        end_params={"r": 12},
    )


def never_ending_game() -> GameSpec:
    """Statically valid but cannot terminate: MOVE keeps NO_LEGAL_MOVE away."""
    return GameSpec(
        spec_id="forever",
        name="forever",
        board=BoardSpec(width=5, height=5),
        tokens_per_player=3,
        actions=[
            TurnAction(kind=ActionKind.PLACE),
            TurnAction(kind=ActionKind.MOVE, params={"distance": 1}),
        ],
        scoring=[ScoringRule(kind=ScoringKind.LINE, params={"length": 4, "points": 1})],
        win=WinKind.MOST_AT_END,
        end=EndKind.NO_LEGAL_MOVE,
    )


def contradictory_game() -> GameSpec:
    """POOL_EMPTY end without TAKE_POOL — statically contradictory."""
    spec = surround_game()
    spec.spec_id = "contradiction"
    spec.end = EndKind.POOL_EMPTY
    spec.end_params = {}
    return spec


def test_place_legal_moves_on_empty_board():
    spec = surround_game()
    state = GameState(spec)
    moves = legal_moves(spec, state)
    places = [m for m in moves if m[0] == "PLACE"]
    assert len(places) == 16
    assert ("PASS",) in moves


def test_line_scoring_counts_maximal_runs_once():
    spec = GameSpec(
        spec_id="line",
        name="line",
        board=BoardSpec(width=4, height=4),
        tokens_per_player=6,
        actions=[TurnAction(kind=ActionKind.PLACE)],
        scoring=[ScoringRule(kind=ScoringKind.LINE, params={"length": 3, "points": 2})],
        win=WinKind.MOST_AT_END,
        end=EndKind.BOARD_FULL,
    )
    state = GameState(spec)
    for x in range(3):
        state.board[(x, 0)] = 0
    assert score(spec, state, 0) == 2  # one run of 3
    state.board[(3, 0)] = 0
    assert score(spec, state, 0) == 2  # a run of 4 is still one maximal run


def test_capture_and_scoring():
    spec = surround_game()
    state = GameState(spec)
    state.board[(0, 0)] = 0
    state.board[(0, 1)] = 1
    state.current = 0
    moves = legal_moves(spec, state)
    assert ("CAPTURE", 0, 1) in moves
    apply_move(spec, state, ("CAPTURE", 0, 1))
    assert state.captured[0] == 1
    assert (0, 1) not in state.board


def test_score_reach_ends_game():
    spec = surround_game()
    spec.win = WinKind.SCORE_REACH
    spec.win_params = {"k": 1}
    state = GameState(spec)
    state.board[(0, 0)] = 0
    state.board[(0, 1)] = 1
    apply_move(spec, state, ("CAPTURE", 0, 1))
    assert state.over and state.winner == 0


def test_double_pass_stalemate_safety_net():
    spec = surround_game()
    state = GameState(spec)
    apply_move(spec, state, ("PASS",))
    assert not state.over
    apply_move(spec, state, ("PASS",))
    assert state.over


def test_good_game_terminates_always():
    spec = surround_game()
    config = MissionConfig()
    metrics = evaluate_spec(spec, config, seed=1)
    assert metrics["termination_rate"] == 1.0
    assert metrics["mean_turns"] <= 24  # ROUNDS r=12 * 2 players


def test_never_ending_game_is_caught_dynamically():
    config = MissionConfig()
    spec = never_ending_game()
    assert static_issues(spec) == []  # statically fine
    metrics = evaluate_spec(spec, config, seed=1)
    assert metrics["termination_rate"] < config.min_termination_rate
    kinds = [i.kind for i in dynamic_issues(metrics, config)]
    assert "NON_TERMINATION" in kinds


def test_contradiction_is_caught_statically():
    kinds = [i.kind for i in static_issues(contradictory_game())]
    assert "CONTRADICTION" in kinds


def test_playout_determinism():
    spec = surround_game()
    config = MissionConfig()
    a = evaluate_spec(spec, config, seed=5)
    b = evaluate_spec(spec, config, seed=5)
    assert a == b
    c = evaluate_spec(spec, config, seed=6)
    assert a != c


def test_single_playout_runs():
    spec = surround_game()
    config = MissionConfig()
    stats = run_playout(
        spec, [GreedyPolicy(), RandomPolicy()], random.Random(3), config
    )
    assert stats.terminated
    assert stats.turns > 0


def test_evaluation_cost_and_depth2_cost():
    """M1 measurement task: is the 2-ply depth metric affordable?"""
    spec = surround_game()
    config = MissionConfig()
    t0 = time.perf_counter()
    evaluate_spec(spec, config, seed=2)
    base = time.perf_counter() - t0

    deep = MissionConfig(depth_metric_enabled=True)
    t0 = time.perf_counter()
    evaluate_spec(spec, deep, seed=2)
    deep_cost = time.perf_counter() - t0

    assert base < 5.0, f"base evaluation too slow: {base:.2f}s"
    # record the ratio in the test output for the decision log
    print(f"\nevaluate_spec cost: base={base:.3f}s depth2={deep_cost:.3f}s "
          f"ratio={deep_cost / max(base, 1e-9):.1f}x")
