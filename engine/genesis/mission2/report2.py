"""Run the 4-group comparison over seeds and check the pre-registration."""

from __future__ import annotations

import json
import statistics

from pydantic import BaseModel, Field

from genesis.mission2.clues import generate_instance
from genesis.mission2.config import Mission2Config
from genesis.mission2.groups import GroupResult, run_group

GROUPS = ("A", "B", "C", "D", "E")


class Mission2Report(BaseModel):
    seeds: list[int]
    accuracy: dict[str, list[float]]
    solved: dict[str, int]
    c_gt_b: int = 0
    c_ge_d: int = 0
    d_gt_c: int = 0
    e_ge_d: int = 0
    e_ge_c: int = 0
    waste: dict[str, list[float]] = Field(default_factory=dict)
    coverage: dict[str, list[float]] = Field(default_factory=dict)
    rounds_to_unique: dict[str, list[int]] = Field(default_factory=dict)
    results: list[GroupResult] = Field(default_factory=list)


def run_mission2(config: Mission2Config, seeds: list[int]) -> Mission2Report:
    report = Mission2Report(
        seeds=seeds,
        accuracy={g: [] for g in GROUPS},
        solved={g: 0 for g in GROUPS},
        waste={g: [] for g in ("C", "D", "E")},
        coverage={g: [] for g in ("C", "D", "E")},
        rounds_to_unique={g: [] for g in ("C", "D", "E")},
    )
    for seed in seeds:
        instance = generate_instance(seed, config)
        results = {g: run_group(g, instance, config) for g in GROUPS}
        for g in GROUPS:
            r = results[g]
            report.accuracy[g].append(r.expected_accuracy)
            report.solved[g] += r.solved
            report.results.append(r)
        for g in ("C", "D", "E"):
            report.waste[g].append(results[g].waste_rate)
            report.coverage[g].append(results[g].coverage)
            if results[g].rounds_to_unique > 0:
                report.rounds_to_unique[g].append(results[g].rounds_to_unique)
        c, b, d, e = (results[g].expected_accuracy for g in ("C", "B", "D", "E"))
        report.c_gt_b += c > b
        report.c_ge_d += c >= d
        report.d_gt_c += d > c
        report.e_ge_d += e >= d
        report.e_ge_c += e >= c
    return report


def format_mission2(report: Mission2Report, config: Mission2Config) -> str:
    n = len(report.seeds)

    def line(g: str) -> str:
        vals = report.accuracy[g]
        return (
            f"  {g}: median={statistics.median(vals):.3f} "
            f"mean={statistics.fmean(vals):.3f} 유일해 도달 {report.solved[g]}/{n}"
        )

    out = [
        f"=== 실험 2: 분산 단서 추리, {n} seeds, N={config.n_agents}, "
        f"공유 예산 {config.share_budget_fraction:.0%} ===",
        "",
        "기대 정확도:",
        *(line(g) for g in GROUPS),
        "",
        "사전 등록 대조:",
        f"  V1 (A 전부 해결): {'통과' if report.solved['A'] == n else '실패 — 실험 무효'}",
        f"  V2 (B < 0.2 전 seed): "
        + (
            "통과"
            if all(v < 0.2 for v in report.accuracy["B"])
            else "실패 — 실험 무효"
        ),
        f"  P1 (C > B 전 seed): {report.c_gt_b}/{n} "
        + ("통과" if report.c_gt_b == n else "미충족"),
        f"  P2 (C >= D in >=13/20): {report.c_ge_d}/{n} "
        + ("충족" if report.c_ge_d >= max(1, round(n * 13 / 20)) else "미충족"),
        f"  P3 (D 유일해 도달 < 전 seed): {report.solved['D']}/{n} "
        + ("통과" if report.solved["D"] < n else "미충족 — 예산 헐거움"),
        f"  P4 (E >= D 전 seed): {report.e_ge_d}/{n} "
        + ("통과" if report.e_ge_d == n else "미충족 — 구현 버그 의심"),
        f"  P5 (E >= C in >=13/20): {report.e_ge_c}/{n} "
        + ("충족" if report.e_ge_c >= max(1, round(n * 13 / 20)) else "미충족"),
        "",
        "공유의 질 (C vs D vs E):",
        f"  낭비율: C={statistics.fmean(report.waste['C']):.3f} "
        f"D={statistics.fmean(report.waste['D']):.3f} "
        f"E={statistics.fmean(report.waste['E']):.3f}",
        f"  커버리지: C={statistics.fmean(report.coverage['C']):.3f} "
        f"D={statistics.fmean(report.coverage['D']):.3f} "
        f"E={statistics.fmean(report.coverage['E']):.3f}",
    ]
    for g in ("C", "D", "E"):
        r = report.rounds_to_unique[g]
        if r:
            out.append(
                f"  {g} 유일해 도달 공유 수: median={statistics.median(r):.0f} "
                f"(도달 seed {len(r)}개)"
            )
    return "\n".join(out)


def save_mission2(path: str, report: Mission2Report) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report.model_dump(), f, ensure_ascii=False, indent=1)
