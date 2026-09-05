"""Experiment 4: slack as the independent variable (docs/mission4-design.md).

Fixed medium-tier instances; the share budget is set per instance as
round(slack x min_certificate), where min_certificate is the *exact*
smallest clue subset proving the answer — computed by seeding the search
with the critical clues (every certificate must contain them, proven in
experiment 3) and iteratively deepening over non-critical completions.
"""

from __future__ import annotations

import json
import random
import statistics
from itertools import combinations

from pydantic import BaseModel, Field

from genesis.mission2.clues import Instance
from genesis.mission2.config import Mission2Config
from genesis.mission2.exp3 import (
    _Run,
    critical_ids,
    run_central,
    run_decap,
    tier_instance,
)
from genesis.mission2.groups import _best_accuracy
from genesis.mission2.solver import survivors

SLACKS = (0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0)
GROUPS4 = ("C", "E", "F0.5", "G", "Edecap")


def min_certificate(
    instance: Instance, config: Mission2Config
) -> tuple[int, list[str]]:
    """Exact minimum proving subset: criticals + smallest completion."""
    crits_ids = critical_ids(instance, config)
    crits = [c for c in instance.clues if c.clue_id in crits_ids]
    others = [c for c in instance.clues if c.clue_id not in crits_ids]
    if len(survivors(crits, config)) == 1:
        return len(crits), [c.clue_id for c in crits]
    for k in range(1, len(others) + 1):
        for combo in combinations(others, k):
            if len(survivors(crits + list(combo), config)) == 1:
                return len(crits) + k, [c.clue_id for c in crits + list(combo)]
    raise RuntimeError("full set is not unique?")  # generator guarantees it


class CInstrumented(BaseModel):
    seed: int
    slack: float
    expected_accuracy: float
    solved: bool
    first_suboptimal: int = -1     # share index of first non-global-best pick
    recovered: bool = False        # had a suboptimal pick but still solved
    no_return_at: int = -1         # conservative point of certain failure


def run_c_instrumented(
    instance: Instance,
    config: Mission2Config,
    budget: int,
    crit_ids: set[str],
    salt: int = 0,
) -> CInstrumented:
    rng = random.Random(f"m4:{instance.seed}:C:{salt}")
    run = _Run(instance, config, budget)
    own_ids = [set(ids) for ids in instance.partition]
    first_suboptimal = -1
    no_return_at = -1

    while run.shares < run.budget and not run.done:
        agents = run.active_agents()
        if not agents:
            break
        global_best = min(run.local_best(ai)[1] for ai in agents)
        rng.shuffle(agents)
        for ai in agents:
            if run.shares >= run.budget or run.done:
                break
            clue, after = run.local_best(ai)
            if after > global_best and first_suboptimal < 0:
                first_suboptimal = run.shares + 1
            run.commit(clue)
            remaining = run.budget - run.shares
            if no_return_at < 0 and not run.done:
                min_missing = min(
                    len(crit_ids - (run.board_ids | own)) for own in own_ids
                )
                if min_missing > remaining:
                    no_return_at = run.shares
            # global best is stale after a commit; recompute next round
            global_best = min(
                (run.local_best(a)[1] for a in run.active_agents()),
                default=global_best,
            )

    acc = _best_accuracy(run.board, run.agent_clues, config)
    return CInstrumented(
        seed=instance.seed,
        slack=0.0,  # filled by caller
        expected_accuracy=acc,
        solved=acc == 1.0,
        first_suboptimal=first_suboptimal,
        recovered=(first_suboptimal > 0 and acc == 1.0),
        no_return_at=no_return_at,
    )


class Mission4Report(BaseModel):
    seeds: list[int]
    slacks: list[float]
    min_certs: list[int]
    b_floor: list[float]
    accuracy: dict[str, dict[str, list[float]]]   # group -> str(slack) -> vals
    solved: dict[str, dict[str, int]]
    c_instr: list[CInstrumented] = Field(default_factory=list)


def run_mission4(config: Mission2Config, seeds: list[int]) -> Mission4Report:
    report = Mission4Report(
        seeds=seeds,
        slacks=list(SLACKS),
        min_certs=[],
        b_floor=[],
        accuracy={g: {str(s): [] for s in SLACKS} for g in GROUPS4},
        solved={g: {str(s): 0 for s in SLACKS} for g in GROUPS4},
    )
    for seed in seeds:
        instance = tier_instance(seed, config, "medium")
        crit = critical_ids(instance, config)
        cert_size, _ = min_certificate(instance, config)
        report.min_certs.append(cert_size)

        clue_map = {c.clue_id: c for c in instance.clues}
        b_acc = max(
            1.0 / len(survivors([clue_map[cid] for cid in ids], config))
            for ids in instance.partition
        )
        report.b_floor.append(b_acc)

        for slack in SLACKS:
            budget = max(1, round(slack * cert_size))
            ci = run_c_instrumented(instance, config, budget, crit)
            ci = ci.model_copy(update={"slack": slack})
            report.c_instr.append(ci)
            runs = {
                "C": (ci.expected_accuracy, ci.solved),
            }
            e = run_central(instance, config, "medium", "E", budget=budget)
            f = run_central(
                instance, config, "medium", "F", sigma=0.5, budget=budget
            )
            g = run_central(instance, config, "medium", "G", budget=budget)
            d = run_decap(instance, config, "medium", budget=budget)
            runs["E"] = (e.expected_accuracy, e.solved)
            runs["F0.5"] = (f.expected_accuracy, f.solved)
            runs["G"] = (g.expected_accuracy, g.solved)
            runs["Edecap"] = (d.expected_accuracy, d.solved)
            for grp, (acc, solved) in runs.items():
                report.accuracy[grp][str(slack)].append(acc)
                report.solved[grp][str(slack)] += solved
    return report


def _mean(xs) -> float:
    xs = list(xs)
    return statistics.fmean(xs) if xs else 0.0


def format_mission4(report: Mission4Report, config: Mission2Config) -> str:
    n = len(report.seeds)
    acc = report.accuracy
    lines = [
        f"=== 실험 4: 여유율 스윕, {n} seeds, min_cert 평균 "
        f"{_mean(report.min_certs):.1f}, B 바닥 {_mean(report.b_floor):.3f} ===",
        "",
        "정확도 평균 (행=여유율):",
        "  slack   " + "  ".join(f"{g:>7s}" for g in GROUPS4),
    ]
    for s in report.slacks:
        lines.append(
            f"  {s:<7}" + "  ".join(f"{_mean(acc[g][str(s)]):7.3f}" for g in GROUPS4)
        )
    lines += ["", "도달률 (도달 seed 수):",
              "  slack   " + "  ".join(f"{g:>7s}" for g in GROUPS4)]
    for s in report.slacks:
        lines.append(
            f"  {s:<7}"
            + "  ".join(f"{report.solved[g][str(s)]:7d}" for g in GROUPS4)
        )

    def curve(group: str, threshold: float) -> float | None:
        for s in report.slacks:
            if report.solved[group][str(s)] >= threshold * n:
                return s
        return None

    low = [0.75, 1.0, 1.25]
    high = [2.5, 3.0, 4.0]

    def band_gap(a: str, b: str, band) -> float:
        return _mean(
            _mean(acc[a][str(s)]) - _mean(acc[b][str(s)]) for s in band
        )

    # P11: monotone non-decreasing C means (tolerance 0.02)
    c_means = [_mean(acc["C"][str(s)]) for s in report.slacks]
    violations = sum(
        1 for a, b in zip(c_means, c_means[1:]) if b < a - 0.02
    )
    p12_low = band_gap("E", "C", low)
    p12_high = band_gap("E", "C", high)
    p13_low = band_gap("E", "Edecap", low)
    p13_high = band_gap("E", "Edecap", high)
    p14_levels = sum(
        band_gap("E", "G", [s]) >= band_gap("E", "F0.5", [s])
        for s in report.slacks
    )
    p14_damp = band_gap("E", "G", low) > band_gap("E", "G", high)
    c90 = curve("C", 0.9)
    e90 = curve("E", 0.9)

    lines += [
        "",
        "사전 등록 대조:",
        f"  P11 (C 단조 비감소): 위반 {violations}건 -> "
        + ("충족" if violations == 0 else "미충족"),
        f"  P12 (E-C 격차, 저>고): 저구간 {p12_low:.3f} vs 고구간 {p12_high:.3f} -> "
        + ("충족" if p12_low > p12_high else "미충족"),
        f"  P13 (decap 하락 저≥0.10, 고<0.05): 저 {p13_low:.3f}, 고 {p13_high:.3f} -> "
        + ("충족" if p13_low >= 0.10 and p13_high < 0.05 else "미충족"),
        f"  P14 (G피해≥F피해 ≥6/8격자, 여유율로 완충): {p14_levels}/8, "
        f"저 {band_gap('E', 'G', low):.3f} > 고 {band_gap('E', 'G', high):.3f} -> "
        + ("충족" if p14_levels >= 6 and p14_damp else "미충족"),
        f"  P15 (C 90% 임계 여유율, 예상 1.5~3.5): {c90} -> "
        + ("충족" if c90 is not None and 1.5 <= c90 <= 3.5 else "미충족/범위 밖"),
        "",
        "곡선 지표:",
        f"  50% 도달 여유율: C={curve('C', 0.5)} E={curve('E', 0.5)} "
        f"Edecap={curve('Edecap', 0.5)} G={curve('G', 0.5)}",
        f"  90% 도달 여유율: C={c90} E={e90} "
        f"Edecap={curve('Edecap', 0.9)} G={curve('G', 0.9)}",
        f"  통신 절약 배율 (C90/E90): "
        + (f"{c90 / e90:.2f}x" if c90 and e90 else "산출 불가"),
        "",
        "복구 공간 분석 (C):",
        "  slack  비최적발생  복구율    확정실패시점(중앙값)",
    ]
    for s in report.slacks:
        rows = [r for r in report.c_instr if r.slack == s]
        with_sub = [r for r in rows if r.first_suboptimal > 0]
        rec = sum(r.recovered for r in with_sub)
        nr = [r.no_return_at for r in rows if r.no_return_at > 0]
        lines.append(
            f"  {s:<6} {len(with_sub):>2d}/{len(rows):<8d} "
            + (f"{rec / len(with_sub):.2f}" if with_sub else "  - ")
            + "      "
            + (f"{statistics.median(nr):.0f}" if nr else "-")
        )
    return "\n".join(lines)


def save_mission4(path: str, report: Mission4Report) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report.model_dump(), f, ensure_ascii=False, indent=1)
