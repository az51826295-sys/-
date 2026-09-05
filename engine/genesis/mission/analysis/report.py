"""Full A/B/C experiment runner and report (design 9).

Per seed: A, B, C, plus a clone-control C (trait_sd=0, differentiation
baseline) and a removal C (robustness). Verdicts use only the objective
score and the pre-registered predictions.
"""

from __future__ import annotations

import json
import statistics

from pydantic import BaseModel, Field

from genesis.mission.analysis.lineage import lineage_metrics
from genesis.mission.analysis.roles import (
    cluster_roles,
    context_responsiveness,
    differentiation,
)
from genesis.mission.config import MissionConfig
from genesis.mission.models.gamespec import GameSpec
from genesis.mission.rounds import RunResult, run_arm


class ExperimentReport(BaseModel):
    seeds: list[int]
    final_scores: dict[str, list[float]]        # arm -> per-seed scores
    improvements: dict[str, list[float]]
    c_ge_b: int = 0
    c_gt_b: int = 0
    diff_c: list[float] = Field(default_factory=list)
    diff_control: list[float] = Field(default_factory=list)
    responsiveness_c: list[float] = Field(default_factory=list)
    lineage: dict[str, float] = Field(default_factory=dict)
    counterfactual_differs: int = 0
    removal_drop: list[float] = Field(default_factory=list)
    example_final: str = ""


def _run_seed(
    config: MissionConfig, seed: int
) -> tuple[int, dict[str, RunResult], RunResult, RunResult]:
    """One seed's full workload: A, B, C, clone-control C, removal C.
    Seeds are independent, so this is the parallelization unit."""
    results = {arm: run_arm(arm, config, seed) for arm in ("A", "B", "C")}
    control = run_arm("C", config.model_copy(update={"trait_sd": 0.0}), seed)
    removal = run_arm("C", config, seed, removal=True)
    return seed, results, control, removal


def run_experiment(
    config: MissionConfig, seeds: list[int], progress=None, workers: int = 1
) -> tuple[ExperimentReport, list[RunResult]]:
    report = ExperimentReport(
        seeds=seeds,
        final_scores={"A": [], "B": [], "C": []},
        improvements={"A": [], "B": [], "C": []},
    )
    lineage_acc: dict[str, list[float]] = {}
    all_results: list[RunResult] = []
    best_c: RunResult | None = None

    per_seed: list[tuple[int, dict[str, RunResult], RunResult, RunResult]] = []
    if workers > 1:
        from concurrent.futures import ProcessPoolExecutor, as_completed

        with ProcessPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(_run_seed, config, s) for s in seeds]
            for future in as_completed(futures):
                item = future.result()
                per_seed.append(item)
                if progress:
                    progress(item[0], item[1])
        per_seed.sort(key=lambda t: t[0])  # aggregation order is deterministic
    else:
        for seed in seeds:
            item = _run_seed(config, seed)
            per_seed.append(item)
            if progress:
                progress(item[0], item[1])

    for seed, results, control, removal in per_seed:
        all_results += [*results.values(), control, removal]

        for arm in ("A", "B", "C"):
            report.final_scores[arm].append(results[arm].final_objective)
            report.improvements[arm].append(results[arm].improvement)
        c, b = results["C"], results["B"]
        report.c_ge_b += c.final_objective >= b.final_objective
        report.c_gt_b += c.final_objective > b.final_objective
        report.counterfactual_differs += c.counterfactual_differs

        agent_ids = [f"a{i}" for i in range(config.n_agents)]
        report.diff_c.append(differentiation(c.events, agent_ids))
        report.diff_control.append(differentiation(control.events, agent_ids))
        report.responsiveness_c.append(
            context_responsiveness(c.events, agent_ids, config.n_rounds)
        )
        for key, value in lineage_metrics(c).items():
            lineage_acc.setdefault(key, []).append(value)
        report.removal_drop.append(c.final_objective - removal.final_objective)

        if best_c is None or c.final_objective > best_c.final_objective:
            best_c = c

    report.lineage = {k: sum(v) / len(v) for k, v in lineage_acc.items()}
    if best_c and best_c.final_spec_json:
        report.example_final = best_c.final_spec_json
    return report, all_results


def render_spec(spec: GameSpec) -> str:
    lines = [
        f"게임: {spec.name}",
        f"인원: {spec.players_min}~{spec.players_max}명 | "
        f"구성물: 격자 {spec.board.width}x{spec.board.height}, "
        f"1인당 토큰 {spec.tokens_per_player}개"
        + (f", 공유 풀 {spec.shared_pool}개" if spec.shared_pool else ""),
        "턴 행동: "
        + " / ".join(
            f"{a.kind.value}({', '.join(f'{k}={v}' for k, v in a.params.items())})"
            if a.params
            else a.kind.value
            for a in spec.actions
        )
        + " / PASS",
        "채점: "
        + " / ".join(
            f"{s.kind.value}({', '.join(f'{k}={v}' for k, v in s.params.items())})"
            for s in spec.scoring
        ),
        f"승리: {spec.win.value}"
        + (f" {spec.win_params}" if spec.win_params else "")
        + f" | 종료: {spec.end.value}"
        + (f" {spec.end_params}" if spec.end_params else ""),
        f"예상 시간: {spec.est_minutes:.1f}분" if spec.est_minutes else "",
    ]
    return "\n".join(line for line in lines if line)


def format_report(report: ExperimentReport, config: MissionConfig) -> str:
    def stats_line(values: list[float]) -> str:
        return (
            f"median={statistics.median(values):.3f} "
            f"mean={statistics.fmean(values):.3f}"
        )

    n = len(report.seeds)
    lines = [
        f"=== Mission experiment: {n} seeds, N={config.n_agents}, "
        f"T={config.n_rounds} (budget {config.n_agents * config.n_rounds}) ===",
        "",
        "1차 지표 — 최종안 objective:",
    ]
    for arm in ("A", "B", "C"):
        lines.append(f"  {arm}: {stats_line(report.final_scores[arm])}")
    lines += [
        f"  C >= B: {report.c_ge_b}/{n} seeds | C > B: {report.c_gt_b}/{n}",
        f"  사전 예측 (C>=B in >=13/20): "
        + ("충족" if report.c_ge_b >= math_ceil_13(n) else "미충족"),
        "",
        "2차 지표 — 개선도 (최종 - 1라운드 최고):",
    ]
    for arm in ("A", "B", "C"):
        lines.append(f"  {arm}: {stats_line(report.improvements[arm])}")
    diff_c_med = statistics.median(report.diff_c)
    control_sorted = sorted(report.diff_control)
    p95 = control_sorted[min(len(control_sorted) - 1, int(0.95 * len(control_sorted)))]
    lines += [
        "",
        "3차 지표 — C군 역할 분화:",
        f"  분화도(JSD): {stats_line(report.diff_c)}",
        f"  클론 대조군 95분위: {p95:.3f} -> "
        + ("분화 판정" if diff_c_med > p95 else "분화 아님 (traits 메아리 범위)"),
        f"  맥락 반응성: {stats_line(report.responsiveness_c)}",
        "  정보 전파(평균/seed): "
        + ", ".join(f"{k}={v:.1f}" for k, v in sorted(report.lineage.items())),
        f"  투표 반사실: 선택이 달라졌을 seed {report.counterfactual_differs}/{n}",
        "",
        "강건성 — 개체 2 제거 시 최종 점수 하락:",
        f"  {stats_line(report.removal_drop)}",
    ]
    if report.example_final:
        spec = GameSpec.model_validate_json(report.example_final)
        lines += ["", "최고 C 최종안:", render_spec(spec)]
    return "\n".join(lines)


def math_ceil_13(n: int) -> int:
    """Pre-registered threshold 13/20, scaled to the actual seed count."""
    return max(1, round(n * 13 / 20))


def save_results(path: str, results: list[RunResult]) -> None:
    import sqlite3

    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS runs "
        "(arm TEXT, seed INTEGER, removal INTEGER, result_json TEXT)"
    )
    for r in results:
        conn.execute(
            "INSERT INTO runs VALUES (?, ?, ?, ?)",
            (r.arm, r.seed, 1 if r.removed else 0, r.model_dump_json()),
        )
    conn.commit()
    conn.close()


def save_report(path: str, report: ExperimentReport) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report.model_dump(), f, ensure_ascii=False, indent=1)
