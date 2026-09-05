"""The rule space: constructive sampling, mutation, fingerprints.

`sample()` enforces hard constraints so the space isn't junk.
`mutate()` deliberately may break a game (only clones are gated):
if mutation could never produce mistakes, CRITIQUE would have nothing
real to catch (decision 19). `check_constraints()` is the shared truth
used by sampling, static checks, and tests.

LLM boundary: a future generative model replaces only `sample`/`mutate`
behind these signatures.
"""

from __future__ import annotations

import random

from genesis.mission.models.artifacts import Critique
from genesis.mission.models.gamespec import (
    ActionKind,
    BoardSpec,
    EndKind,
    GameSpec,
    ScoringKind,
    ScoringRule,
    TurnAction,
    WinKind,
)
from genesis.mission.models.traits import AgentTraits
from genesis.mission.grammar.clones import is_clone

Fingerprint = tuple

BOARD_ACTIONS = {ActionKind.PLACE, ActionKind.MOVE}


# ---------------------------------------------------------------- constraints


def check_constraints(spec: GameSpec) -> list[str]:
    v: list[str] = []
    b = spec.board
    if not (3 <= b.width <= 5 and 3 <= b.height <= 5):
        v.append("board dims out of range 3..5")
    kinds = spec.action_kinds()
    if not (1 <= len(spec.actions) <= 4):
        v.append("action count out of range 1..4")
    if len(kinds) != len(spec.actions):
        v.append("duplicate action kinds")
    if ActionKind.MOVE in kinds and ActionKind.PLACE not in kinds:
        v.append("MOVE requires PLACE (tokens start in hand)")
    if ActionKind.CAPTURE in kinds and not (kinds & BOARD_ACTIONS):
        v.append("CAPTURE requires a board action")
    if ActionKind.TAKE_POOL in kinds and spec.shared_pool < 1:
        v.append("TAKE_POOL requires a non-empty shared pool")
    if not (3 <= spec.tokens_per_player <= 10):
        v.append("tokens_per_player out of range 3..10")
    if not (1 <= len(spec.scoring) <= 2):
        v.append("scoring rule count out of range 1..2")
    if len(spec.scoring_kinds()) != len(spec.scoring):
        v.append("duplicate scoring kinds")
    for rule in spec.scoring:
        if rule.kind in (ScoringKind.LINE, ScoringKind.AREA_MAJORITY):
            if not (kinds & BOARD_ACTIONS):
                v.append(f"{rule.kind.value} scoring requires a board action")
        if rule.kind == ScoringKind.LINE:
            length = rule.params.get("length", 0)
            if length > max(b.width, b.height):
                v.append("LINE length exceeds board")
            if not (3 <= length <= 4):
                v.append("LINE length out of range 3..4")
        if rule.kind == ScoringKind.CAPTURED and ActionKind.CAPTURE not in kinds:
            v.append("CAPTURED scoring requires CAPTURE")
        if rule.kind == ScoringKind.POOL_HELD and ActionKind.TAKE_POOL not in kinds:
            v.append("POOL_HELD scoring requires TAKE_POOL")
    if spec.win in (WinKind.SCORE_REACH, WinKind.MOST_AT_END) and not spec.scoring:
        v.append(f"{spec.win.value} requires a scoring rule")
    if spec.win == WinKind.SCORE_REACH and not (3 <= spec.win_params.get("k", 0) <= 12):
        v.append("SCORE_REACH k out of range 3..12")
    if spec.end == EndKind.ROUNDS and not (6 <= spec.end_params.get("r", 0) <= 20):
        v.append("ROUNDS r out of range 6..20")
    if spec.end == EndKind.BOARD_FULL and ActionKind.PLACE not in kinds:
        v.append("BOARD_FULL requires PLACE")
    if spec.end == EndKind.POOL_EMPTY and ActionKind.TAKE_POOL not in kinds:
        v.append("POOL_EMPTY requires TAKE_POOL")
    return v


# ---------------------------------------------------------------- fingerprint


def fingerprint(spec: GameSpec) -> Fingerprint:
    return (
        spec.board.width,
        spec.board.height,
        tuple(sorted(k.value for k in spec.action_kinds())),
        tuple(sorted(k.value for k in spec.scoring_kinds())),
        spec.win.value,
        spec.end.value,
    )


def fingerprint_distance(a: Fingerprint, b: Fingerprint) -> float:
    aw, ah, aact, asc, awin, aend = a
    bw, bh, bact, bsc, bwin, bend = b
    d = 0.0
    d += 0.25 * abs(aw - bw) / 2 + 0.25 * abs(ah - bh) / 2
    d += 1.0 * len(set(aact) ^ set(bact)) / 4
    d += 1.0 * len(set(asc) ^ set(bsc)) / 2
    d += 0.5 * (awin != bwin) + 0.5 * (aend != bend)
    return d / 3.5


# ------------------------------------------------------------------- sampling


def _draw_candidate(rng: random.Random, spec_id: str) -> GameSpec:
    board = BoardSpec(width=rng.randint(3, 5), height=rng.randint(3, 5))

    kinds: list[ActionKind] = [ActionKind.PLACE]
    extra = [ActionKind.MOVE, ActionKind.CAPTURE, ActionKind.TAKE_POOL]
    rng.shuffle(extra)
    for kind in extra[: rng.randint(0, 2)]:
        kinds.append(kind)

    actions = []
    for kind in kinds:
        params: dict[str, int] = {}
        if kind == ActionKind.MOVE:
            params["distance"] = rng.randint(1, 2)
        elif kind == ActionKind.CAPTURE:
            params["flanked"] = rng.randint(0, 1)
        elif kind == ActionKind.TAKE_POOL:
            params["k"] = rng.randint(1, 3)
        actions.append(TurnAction(kind=kind, params=params))
    kind_set = set(kinds)

    allowed_scoring = [ScoringKind.LINE, ScoringKind.AREA_MAJORITY]
    if ActionKind.CAPTURE in kind_set:
        allowed_scoring.append(ScoringKind.CAPTURED)
    if ActionKind.TAKE_POOL in kind_set:
        allowed_scoring.append(ScoringKind.POOL_HELD)
    n_scoring = rng.randint(1, min(2, len(allowed_scoring)))
    chosen = rng.sample(allowed_scoring, n_scoring)
    scoring = []
    for kind in chosen:
        params = {"points": rng.randint(1, 3)}
        if kind == ScoringKind.LINE:
            params["length"] = rng.randint(3, min(4, max(board.width, board.height)))
        scoring.append(ScoringRule(kind=kind, params=params))

    win = rng.choice([WinKind.SCORE_REACH, WinKind.MOST_AT_END, WinKind.LAST_MOVER])
    win_params = {"k": rng.randint(3, 12)} if win == WinKind.SCORE_REACH else {}

    allowed_end = [EndKind.ROUNDS, EndKind.NO_LEGAL_MOVE, EndKind.BOARD_FULL]
    if ActionKind.TAKE_POOL in kind_set:
        allowed_end.append(EndKind.POOL_EMPTY)
    end = rng.choice(allowed_end)
    end_params = {"r": rng.randint(6, 20)} if end == EndKind.ROUNDS else {}

    spec = GameSpec(
        spec_id=spec_id,
        name="",
        players_max=rng.randint(2, 4),
        board=board,
        tokens_per_player=rng.randint(3, 10),
        shared_pool=rng.randint(4, 12) if ActionKind.TAKE_POOL in kind_set else 0,
        actions=actions,
        scoring=scoring,
        win=win,
        win_params=win_params,
        end=end,
        end_params=end_params,
    )
    spec.name = _make_name(spec)
    spec.design_intent = _make_intent(spec)
    return spec


def _rarity(spec: GameSpec) -> float:
    score = 0.0
    for a in spec.actions:
        if a.kind == ActionKind.CAPTURE and a.params.get("flanked"):
            score += 0.5
    if spec.win == WinKind.LAST_MOVER:
        score += 0.3
    if spec.end == EndKind.POOL_EMPTY:
        score += 0.2
    return score


def sample(
    rng: random.Random,
    traits: AgentTraits,
    existing: list[Fingerprint],
    spec_id: str,
) -> GameSpec:
    """Draw 3 valid candidates, pick the one the traits prefer."""
    candidates: list[GameSpec] = []
    guard = 0
    while len(candidates) < 3 and guard < 100:
        guard += 1
        cand = _draw_candidate(rng, spec_id)
        if check_constraints(cand) or is_clone(cand):
            continue
        candidates.append(cand)
    if not candidates:  # pragma: no cover - space is dense in valid specs
        raise RuntimeError("could not sample a valid spec")

    def preference(spec: GameSpec) -> float:
        fp = fingerprint(spec)
        novelty = (
            min(fingerprint_distance(fp, e) for e in existing) if existing else 0.5
        )
        simplicity = 1.0 - (spec.rule_count() - 2) / 4
        return (
            traits.novelty_preference * novelty
            + traits.simplicity_preference * simplicity
            + traits.risk_tolerance * _rarity(spec)
        )

    return max(candidates, key=preference)


# ------------------------------------------------------------------- mutation


def _all_ops(rng: random.Random) -> list[str]:
    ops = [
        "tweak_board",
        "tweak_tokens",
        "tweak_param",
        "add_action",
        "remove_action",
        "swap_scoring",
        "swap_end",
        "swap_win",
    ]
    rng.shuffle(ops)
    return ops


CRITIQUE_OPS: dict[str, list[str]] = {
    "NON_TERMINATION": ["force_rounds_end", "tweak_param"],
    "DOMINANT_STRATEGY": ["add_action", "swap_scoring"],
    "NO_SKILL": ["add_interactive_action", "tweak_param"],
    "DURATION": ["tweak_board", "tweak_tokens", "tweak_param"],
    "CONTRADICTION": ["repair"],
    "CLONE": ["tweak_board", "add_action"],
}


def mutate(
    spec: GameSpec,
    rng: random.Random,
    spec_id: str,
    critique: Critique | None = None,
) -> GameSpec:
    for _ in range(10):
        new = spec.model_copy(deep=True)
        new.spec_id = spec_id
        if critique and critique.issues:
            issue = max(critique.issues, key=lambda i: i.severity)
            ops = list(CRITIQUE_OPS[issue.kind])
            rng.shuffle(ops)
        else:
            ops = _all_ops(rng)
        for op in ops:
            if _apply_op(new, op, rng):
                break
        new.name = _make_name(new)
        new.design_intent = _make_intent(new)
        if not is_clone(new):
            return new
    return spec.model_copy(deep=True, update={"spec_id": spec_id})


def _apply_op(spec: GameSpec, op: str, rng: random.Random) -> bool:
    kinds = spec.action_kinds()
    if op == "tweak_board":
        if rng.random() < 0.5:
            spec.board.width = min(5, max(3, spec.board.width + rng.choice((-1, 1))))
        else:
            spec.board.height = min(5, max(3, spec.board.height + rng.choice((-1, 1))))
        return True
    if op == "tweak_tokens":
        spec.tokens_per_player = min(
            10, max(3, spec.tokens_per_player + rng.choice((-2, -1, 1, 2)))
        )
        return True
    if op == "tweak_param":
        targets: list[tuple[dict, str, int, int]] = []
        for a in spec.actions:
            for key, (lo, hi) in {"distance": (1, 2), "k": (1, 3)}.items():
                if key in a.params:
                    targets.append((a.params, key, lo, hi))
        for s in spec.scoring:
            targets.append((s.params, "points", 1, 3))
            if "length" in s.params:
                targets.append((s.params, "length", 3, 4))
        if "k" in spec.win_params:
            targets.append((spec.win_params, "k", 3, 12))
        if "r" in spec.end_params:
            targets.append((spec.end_params, "r", 6, 20))
        if not targets:
            return False
        params, key, lo, hi = targets[rng.randrange(len(targets))]
        params[key] = min(hi, max(lo, params[key] + rng.choice((-1, 1))))
        return True
    if op in ("add_action", "add_interactive_action"):
        pool = [ActionKind.MOVE, ActionKind.CAPTURE]
        if op == "add_action":
            pool.append(ActionKind.TAKE_POOL)
        missing = [k for k in pool if k not in kinds]
        if not missing or len(spec.actions) >= 4:
            return False
        kind = rng.choice(missing)
        params: dict[str, int] = {}
        if kind == ActionKind.MOVE:
            params["distance"] = rng.randint(1, 2)
        elif kind == ActionKind.CAPTURE:
            params["flanked"] = rng.randint(0, 1)
        elif kind == ActionKind.TAKE_POOL:
            params["k"] = rng.randint(1, 3)
            # a mutation mistake is allowed: only sometimes fix the pool
            if rng.random() < 0.5 and spec.shared_pool < 4:
                spec.shared_pool = rng.randint(4, 12)
        spec.actions.append(TurnAction(kind=kind, params=params))
        return True
    if op == "remove_action":
        if len(spec.actions) <= 1:
            return False
        spec.actions.pop(rng.randrange(len(spec.actions)))
        return True
    if op == "swap_scoring":
        idx = rng.randrange(len(spec.scoring))
        others = [k for k in ScoringKind if k not in spec.scoring_kinds()]
        if not others:
            return False
        kind = rng.choice(others)
        params = {"points": rng.randint(1, 3)}
        if kind == ScoringKind.LINE:
            params["length"] = rng.randint(3, 4)
        spec.scoring[idx] = ScoringRule(kind=kind, params=params)
        return True
    if op == "swap_end":
        others = [k for k in EndKind if k != spec.end]
        spec.end = rng.choice(others)
        spec.end_params = {"r": rng.randint(6, 20)} if spec.end == EndKind.ROUNDS else {}
        return True
    if op == "swap_win":
        others = [k for k in WinKind if k != spec.win]
        spec.win = rng.choice(others)
        spec.win_params = (
            {"k": rng.randint(3, 12)} if spec.win == WinKind.SCORE_REACH else {}
        )
        return True
    if op == "force_rounds_end":
        spec.end = EndKind.ROUNDS
        spec.end_params = {"r": rng.randint(8, 14)}
        return True
    if op == "repair":
        return _repair(spec, rng)
    return False


def _repair(spec: GameSpec, rng: random.Random) -> bool:
    """Fix the first constraint violation for real (targeted, not random)."""
    kinds = spec.action_kinds()
    if ActionKind.MOVE in kinds and ActionKind.PLACE not in kinds:
        spec.actions.insert(0, TurnAction(kind=ActionKind.PLACE))
        return True
    if ActionKind.TAKE_POOL in kinds and spec.shared_pool < 1:
        spec.shared_pool = rng.randint(4, 12)
        return True
    for i, rule in enumerate(list(spec.scoring)):
        broken = (
            (rule.kind == ScoringKind.CAPTURED and ActionKind.CAPTURE not in kinds)
            or (rule.kind == ScoringKind.POOL_HELD and ActionKind.TAKE_POOL not in kinds)
            or (
                rule.kind in (ScoringKind.LINE, ScoringKind.AREA_MAJORITY)
                and not (kinds & BOARD_ACTIONS)
            )
            or (
                rule.kind == ScoringKind.LINE
                and rule.params.get("length", 0)
                > max(spec.board.width, spec.board.height)
            )
        )
        if broken:
            if len(spec.scoring) > 1:
                spec.scoring.pop(i)
            else:
                params = {"points": rng.randint(1, 3)}
                kind = (
                    ScoringKind.AREA_MAJORITY
                    if kinds & BOARD_ACTIONS
                    else ScoringKind.POOL_HELD
                )
                if kind == ScoringKind.POOL_HELD and ActionKind.TAKE_POOL not in kinds:
                    spec.actions.append(
                        TurnAction(kind=ActionKind.TAKE_POOL, params={"k": 1})
                    )
                    spec.shared_pool = max(spec.shared_pool, rng.randint(4, 12))
                spec.scoring[0] = ScoringRule(kind=kind, params=params)
            return True
    if spec.win in (WinKind.SCORE_REACH, WinKind.MOST_AT_END) and not spec.scoring:
        spec.scoring = [
            ScoringRule(kind=ScoringKind.AREA_MAJORITY, params={"points": 1})
        ]
        return True
    if spec.end == EndKind.BOARD_FULL and ActionKind.PLACE not in kinds:
        spec.end = EndKind.ROUNDS
        spec.end_params = {"r": rng.randint(8, 14)}
        return True
    if spec.end == EndKind.POOL_EMPTY and ActionKind.TAKE_POOL not in kinds:
        spec.end = EndKind.ROUNDS
        spec.end_params = {"r": rng.randint(8, 14)}
        return True
    return False


# ----------------------------------------------------------------- templates


_ACTION_WORDS = {
    ActionKind.PLACE: "배치",
    ActionKind.MOVE: "기동",
    ActionKind.CAPTURE: "포획",
    ActionKind.TAKE_POOL: "수집",
}
_SCORING_WORDS = {
    ScoringKind.LINE: "연결",
    ScoringKind.AREA_MAJORITY: "진지",
    ScoringKind.CAPTURED: "사냥",
    ScoringKind.POOL_HELD: "재고",
}


def _make_name(spec: GameSpec) -> str:
    acts = "·".join(
        _ACTION_WORDS[a.kind] for a in spec.actions if a.kind in _ACTION_WORDS
    )
    scores = "·".join(_SCORING_WORDS[s.kind] for s in spec.scoring)
    return f"{spec.board.width}x{spec.board.height} {acts} {scores}전"


def _make_intent(spec: GameSpec) -> str:
    return (
        f"{spec.players_min}~{spec.players_max}인, 토큰 {spec.tokens_per_player}개로 "
        f"{'/'.join(s.kind.value for s in spec.scoring)} 점수를 놓고 겨루는 게임"
    )
