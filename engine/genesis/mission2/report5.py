"""Experiment 5 runner and P16-P19 verdicts."""

from __future__ import annotations

import json
import statistics

from pydantic import BaseModel, Field

from genesis.mission2.config import Mission2Config
from genesis.mission2.exp3 import run_central, tier_instance
from genesis.mission2.exp4 import min_certificate
from genesis.mission2.exp5 import (
    I2Result,
    SLACKS5,
    SocietyStats,
    run_c_with_fidelity,
    run_i2,
    train_society,
)

GROUPS5 = ("C", "E", "I2_untrained", "I2_trained")


class Mission5Report(BaseModel):
    seeds: list[int]
    slacks: list[float]
    accuracy: dict[str, dict[str, list[float]]]
    solved: dict[str, dict[str, int]]
    fidelity: dict[str, dict[str, list[float]]]
    forced: dict[str, dict[str, list[int]]]
    curve: list[float] = Field(default_factory=list)
    n_gain_obs: int = 0


def run_mission5(config: Mission2Config, seeds: list[int]) -> Mission5Report:
    report = Mission5Report(
        seeds=seeds,
        slacks=list(SLACKS5),
        accuracy={g: {str(s): [] for s in SLACKS5} for g in GROUPS5},
        solved={g: {str(s): 0 for s in SLACKS5} for g in GROUPS5},
        fidelity={g: {str(s): [] for s in SLACKS5} for g in GROUPS5},
        forced={
            g: {str(s): [] for s in SLACKS5}
            for g in ("I2_untrained", "I2_trained")
        },
    )
    trained_stats, curve = train_society(config)
    report.curve = curve
    report.n_gain_obs = len(trained_stats.gains)

    for seed in seeds:
        instance = tier_instance(seed, config, "medium")
        cert, _ = min_certificate(instance, config)
        for slack in SLACKS5:
            budget = max(1, round(slack * cert))
            c = run_c_with_fidelity(instance, config, budget)
            e = run_central(instance, config, "medium", "E", budget=budget)
            cold = SocietyStats()
            iu = run_i2(instance, config, budget, cold, learn=False)
            frozen = trained_stats.model_copy(deep=True)
            it = run_i2(instance, config, budget, frozen, learn=False)

            rows: dict[str, I2Result | None] = {
                "C": c, "I2_untrained": iu, "I2_trained": it,
            }
            key = str(slack)
            for grp, r in rows.items():
                report.accuracy[grp][key].append(r.expected_accuracy)
                report.solved[grp][key] += r.solved
                report.fidelity[grp][key].append(r.fidelity)
                if grp in report.forced:
                    report.forced[grp][key].append(r.forced_shares)
            report.accuracy["E"][key].append(e.expected_accuracy)
            report.solved["E"][key] += e.solved
            report.fidelity["E"][key].append(1.0)
    return report


def _mean(xs) -> float:
    xs = list(xs)
    return statistics.fmean(xs) if xs else 0.0


def format_mission5(report: Mission5Report, config: Mission2Config) -> str:
    n = len(report.seeds)
    acc = report.accuracy
    lines = [
        f"=== 실험 5: I-v2 학습형 분산 조정, {n} seeds, "
        f"훈련 관찰 {report.n_gain_obs}건 ===",
        "",
        "정확도 평균 (행=slack):",
        "  slack  " + "  ".join(f"{g:>12s}" for g in GROUPS5),
    ]
    for s in report.slacks:
        lines.append(
            f"  {s:<6}"
            + "  ".join(f"{_mean(acc[g][str(s)]):12.3f}" for g in GROUPS5)
        )
    lines += ["", "도달률:",
              "  slack  " + "  ".join(f"{g:>12s}" for g in GROUPS5)]
    for s in report.slacks:
        lines.append(
            f"  {s:<6}"
            + "  ".join(f"{report.solved[g][str(s)]:12d}" for g in GROUPS5)
        )
    lines += ["", "조정 충실도 (E=1.0 정의):",
              "  slack  " + "  ".join(f"{g:>12s}" for g in GROUPS5)]
    for s in report.slacks:
        lines.append(
            f"  {s:<6}"
            + "  ".join(
                f"{_mean(report.fidelity[g][str(s)]):12.3f}" for g in GROUPS5
            )
        )

    def strict_wins(a: str, b: str, s: float) -> int:
        return sum(
            x > y for x, y in zip(acc[a][str(s)], acc[b][str(s)])
        )

    def ge_wins(a: str, b: str, s: float) -> int:
        return sum(
            x >= y for x, y in zip(acc[a][str(s)], acc[b][str(s)])
        )

    p16 = {s: strict_wins("I2_trained", "C", s) for s in (1.25, 1.5)}
    tight = (1.25, 1.5)
    gap_ec = _mean(
        _mean(acc["E"][str(s)]) - _mean(acc["C"][str(s)]) for s in tight
    )
    gap_ic = _mean(
        _mean(acc["I2_trained"][str(s)]) - _mean(acc["C"][str(s)]) for s in tight
    )
    closure = gap_ic / gap_ec if gap_ec > 0 else 0.0
    p18 = all(
        _mean(acc["I2_trained"][str(s)]) <= _mean(acc["E"][str(s)]) + 1e-9
        for s in report.slacks
    )
    protocol_gain = {
        s: _mean(acc["I2_untrained"][str(s)]) - _mean(acc["C"][str(s)])
        for s in report.slacks
    }
    learning_gain = {
        s: _mean(acc["I2_trained"][str(s)]) - _mean(acc["I2_untrained"][str(s)])
        for s in report.slacks
    }
    p19_learn = {s: ge_wins("I2_trained", "I2_untrained", s) for s in (1.25, 1.5)}

    lines += [
        "",
        "사전 등록 대조:",
        f"  P16 (I2_trained > C, ≥13/20): slack1.25 {p16[1.25]}/20, "
        f"slack1.5 {p16[1.5]}/20 -> "
        + ("충족" if all(v >= 13 for v in p16.values()) else "미충족"),
        f"  P17 (E-C 격차 50% 이상 봉합): 봉합률 {closure:.0%} -> "
        + ("충족" if closure >= 0.5 else "미충족"),
        f"  P18 (I2 ≤ E): " + ("충족" if p18 else "미충족 — I2가 E 초과"),
        "  P19 (기여 분리 — 가짜 창발 통제):",
        "    프로토콜 기여 (미학습 I2 − C): "
        + ", ".join(f"s{s}={protocol_gain[s]:+.3f}" for s in report.slacks),
        "    학습 기여 (학습 − 미학습): "
        + ", ".join(f"s{s}={learning_gain[s]:+.3f}" for s in report.slacks),
        f"    학습≥미학습 seed 수: 1.25에서 {p19_learn[1.25]}/20, "
        f"1.5에서 {p19_learn[1.5]}/20",
        "",
        f"훈련 곡선 (앞10/뒤10 평균): {_mean(report.curve[:10]):.3f} -> "
        f"{_mean(report.curve[-10:]):.3f}",
        "강제 발언 평균/run: "
        + ", ".join(
            f"{g} s{s}={_mean(report.forced[g][str(s)]):.1f}"
            for g in report.forced
            for s in (1.25,)
        ),
    ]
    return "\n".join(lines)


def save_mission5(path: str, report: Mission5Report) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report.model_dump(), f, ensure_ascii=False, indent=1)
