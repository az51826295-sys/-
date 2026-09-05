"""Experiment 3 runner and pre-registration verdicts (P6-P11)."""

from __future__ import annotations

import json
import statistics

from pydantic import BaseModel, Field

from genesis.mission2.config import Mission2Config
from genesis.mission2.exp3 import (
    TIERS,
    VariantResult,
    run_central,
    run_decap,
    run_free,
    run_learned,
    run_voting,
    tier_instance,
    train_learned,
)

SIGMAS = (0.2, 0.5, 1.0)
VARIANT_ORDER = ["C", "E", "F0.2", "F0.5", "F1.0", "G", "H", "Edecap",
                 "I_untrained", "I_trained"]


class Mission3Report(BaseModel):
    seeds: list[int]
    tiers: list[str]
    accuracy: dict[str, dict[str, list[float]]]   # tier -> variant -> per-seed
    solved: dict[str, dict[str, int]]
    curves: dict[str, list[float]] = Field(default_factory=dict)  # I training
    results: list[VariantResult] = Field(default_factory=list)


def run_mission3(config: Mission2Config, seeds: list[int]) -> Mission3Report:
    report = Mission3Report(
        seeds=seeds,
        tiers=list(TIERS),
        accuracy={t: {v: [] for v in VARIANT_ORDER} for t in TIERS},
        solved={t: {v: 0 for v in VARIANT_ORDER} for t in TIERS},
    )
    for tier in TIERS:
        trained_scores, curve = train_learned(config, tier)
        report.curves[tier] = curve
        for seed in seeds:
            instance = tier_instance(seed, config, tier)
            results: list[VariantResult] = [
                run_free(instance, config, tier),
                run_central(instance, config, tier, "E"),
                *(run_central(instance, config, tier, "F", sigma=s) for s in SIGMAS),
                run_central(instance, config, tier, "G"),
                run_voting(instance, config, tier),
                run_decap(instance, config, tier),
            ]
            untrained, _ = run_learned(instance, config, tier, {})
            trained, _ = run_learned(instance, config, tier, trained_scores)
            untrained = untrained.model_copy(update={"variant": "I_untrained"})
            trained = trained.model_copy(update={"variant": "I_trained"})
            results += [untrained, trained]
            for r in results:
                report.accuracy[tier][r.variant].append(r.expected_accuracy)
                report.solved[tier][r.variant] += r.solved
                report.results.append(r)
    return report


def _mean(xs: list[float]) -> float:
    return statistics.fmean(xs) if xs else 0.0


def format_mission3(report: Mission3Report, config: Mission2Config) -> str:
    n = len(report.seeds)
    lines = [
        f"=== 실험 3: 선택 지능의 붕괴 조건, {n} seeds × {len(report.tiers)} tiers ==="
    ]
    for tier in report.tiers:
        lines.append("")
        lines.append(f"[{tier}]")
        for v in VARIANT_ORDER:
            vals = report.accuracy[tier][v]
            lines.append(
                f"  {v:11s} mean={_mean(vals):.3f} 도달 {report.solved[tier][v]}/{n}"
            )
    acc = report.accuracy

    def ge_count(tier, a, b):
        return sum(
            x >= y for x, y in zip(acc[tier][a], acc[tier][b])
        )

    def e_top(tier):
        others = [v for v in VARIANT_ORDER if v != "E"]
        return sum(
            all(
                acc[tier]["E"][i] >= acc[tier][v][i] for v in others
            )
            for i in range(n)
        )

    p6 = min(e_top("easy"), e_top("medium"))
    f_means = [_mean(acc["medium"][f"F{s}"]) for s in SIGMAS]
    p7 = all(a >= b for a, b in zip(f_means, f_means[1:])) and all(
        _mean(acc["medium"]["E"]) >= m for m in f_means
    )
    p8_drop = report.solved["hard"]["E"] < report.solved["easy"]["E"]
    p8_beaten = any(
        _mean(acc["hard"][v]) > _mean(acc["hard"]["E"])
        for v in VARIANT_ORDER
        if v != "E"
    )
    p9_hard = ge_count("hard", "I_trained", "C")
    p9_strict = sum(
        x > y for x, y in zip(acc["hard"]["I_trained"], acc["hard"]["C"])
    )
    p10 = min(
        sum(x < y for x, y in zip(acc[t]["H"], acc[t]["E"]))
        for t in report.tiers
    )
    decap_drop = {
        t: _mean(acc[t]["E"]) - _mean(acc[t]["Edecap"]) for t in report.tiers
    }
    ec_gap = {t: _mean(acc[t]["E"]) - _mean(acc[t]["C"]) for t in report.tiers}

    lines += [
        "",
        "사전 등록 대조:",
        f"  P6 (E 최고, easy·medium ≥18/20): {p6}/20 "
        + ("충족" if p6 >= 18 else "미충족"),
        f"  P7 (F 성능 σ 단조 감소, ≤E): "
        + ("충족" if p7 else "미충족")
        + f"  (F means: {', '.join(f'{m:.3f}' for m in f_means)})",
        f"  P8 (hard에서 E 비최선): E 도달 hard {report.solved['hard']['E']}/{n}"
        f" vs easy {report.solved['easy']['E']}/{n}"
        + f", E를 넘는 군 {'있음' if p8_beaten else '없음'} -> "
        + ("충족" if (p8_drop or p8_beaten) else "미충족"),
        f"  P9 (hard에서 I_trained > C ≥13): 강한 {p9_strict}/20, ≥ 기준 {p9_hard}/20 "
        + ("충족" if p9_strict >= 13 else "미충족"),
        f"  P10 (H < E ≥18/20, 전 tier 최솟값): {p10}/20 "
        + ("충족" if p10 >= 18 else "미충족"),
        "  P11 (E-decap 하락 ≥ (E-C)/2):",
    ]
    for t in report.tiers:
        verdict = decap_drop[t] >= 0.5 * ec_gap[t] and ec_gap[t] > 0
        lines.append(
            f"    {t}: drop={decap_drop[t]:.3f} vs (E-C)/2={0.5 * ec_gap[t]:.3f}"
            f" -> {'취약' if verdict else '견고'}"
        )
    lines += [
        "",
        "I 학습 곡선 (에피소드 정확도, 앞5/뒤5 평균):",
    ]
    for t in report.tiers:
        c = report.curves[t]
        lines.append(
            f"  {t}: {_mean(c[:5]):.3f} -> {_mean(c[-5:]):.3f}"
        )
    return "\n".join(lines)


def save_mission3(path: str, report: Mission3Report) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report.model_dump(), f, ensure_ascii=False, indent=1)
