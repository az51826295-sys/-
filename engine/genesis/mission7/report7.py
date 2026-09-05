"""Mission 7A verdicts (docs/mission7-design.md section 5).

R's 7A-1 baseline is the mission-6 M runs themselves (identical
institution, proposer, and seeds — rerunning them would produce the
same trajectories). R's escape baseline is the mission7 R deadlock
runs. Sample efficiency counts proposal slots: 6 per generation.
"""

from __future__ import annotations

import json
import os
import statistics

from pydantic import BaseModel, Field

from genesis.mission2.config import Mission2Config
from genesis.mission6.dsl import Protocol
from genesis.mission6.evolution import (
    TEST_SEEDS6,
    TRAIN_SLACKS6,
    UNSEEN_SLACKS6,
    build_pairs,
    evaluate,
)
from genesis.mission6.lineage import Lineage, load_lineage

DATA = "data"
SEEDS = (0, 1, 2)
TIERS = ("Z", "S", "T")
PER_GEN = 6
ESCAPE_BAR = 0.85          # registered P30 bar
MARGIN = 0.02

R_BASELINES = {
    0: "mission6_M_lineage.json",
    1: "mission6_M_ms1_lineage.json",
    2: "mission6_M_ms2_lineage.json",
}


def _load(name: str) -> Lineage:
    return load_lineage(os.path.join(DATA, name))


def _scores(lineage: Lineage) -> list[float]:
    return [g.incumbent_score for g in lineage.generations]


def candidates_to_reach(lineage: Lineage, target: float) -> int | None:
    for g in lineage.generations:
        if g.incumbent_score >= target - 1e-9:
            return g.gen * PER_GEN
    return None


class RunSummary(BaseModel):
    tag: str
    final_score: float
    final_acc: float = 0.0
    candidates_to_r_target: int | None = None
    r_target: float = 0.0
    escape_gen: int | None = None      # deadlock runs: first gen above start


class Mission7Report(BaseModel):
    runs: dict[str, RunSummary] = Field(default_factory=dict)
    test_accuracy: dict[str, dict[str, float]] = Field(default_factory=dict)
    usage: dict[str, int] = Field(default_factory=dict)
    verdicts: list[str] = Field(default_factory=list)


def build_report(config: Mission2Config) -> Mission7Report:
    report = Mission7Report()

    r_final: dict[int, float] = {}
    for ms, name in R_BASELINES.items():
        lin = _load(name)
        r_final[ms] = _scores(lin)[-1]
        report.runs[f"R_ms{ms}"] = RunSummary(
            tag=f"R_ms{ms}", final_score=r_final[ms],
            final_acc=lin.generations[-1].train.mean_accuracy
            if lin.generations[-1].train else 0.0)

    for tier in TIERS:
        for ms in SEEDS:
            lin = _load(f"mission7_m7_{tier}_ms{ms}_lineage.json")
            scores = _scores(lin)
            report.runs[f"{tier}_ms{ms}"] = RunSummary(
                tag=f"{tier}_ms{ms}", final_score=scores[-1],
                r_target=r_final[ms],
                candidates_to_r_target=candidates_to_reach(lin, r_final[ms]),
            )

    # the deadlock founding score is R's gen-1 score (R never adopts,
    # so its gen-1 incumbent score IS the founding protocol's score);
    # T runs can adopt at gen 1, so their own scores[0] is not a base
    deadlock_base: dict[int, float] = {}
    for kind in ("R", "T"):
        for ms in SEEDS:
            lin = _load(f"mission7_m7_{kind}_deadlock_ms{ms}_lineage.json")
            scores = _scores(lin)
            if kind == "R":
                deadlock_base[ms] = scores[0]
            base = deadlock_base[ms]
            escape_gen = next(
                (g.gen for g in lin.generations
                 if g.incumbent_score > base + 0.05), None)
            report.runs[f"{kind}dead_ms{ms}"] = RunSummary(
                tag=f"{kind}dead_ms{ms}", final_score=scores[-1],
                escape_gen=escape_gen)

    # generalization: unique final protocols of T runs on the test grid
    pairs = build_pairs(list(TEST_SEEDS6),
                        TRAIN_SLACKS6 + UNSEEN_SLACKS6, config, cycle=False)
    seen: dict[str, str] = {}
    for label in ([f"T_ms{m}" for m in SEEDS]
                  + [f"Tdead_ms{m}" for m in SEEDS]):
        fname = (f"mission7_m7_T_ms{label[-1]}_lineage.json"
                 if label.startswith("T_")
                 else f"mission7_m7_T_deadlock_ms{label[-1]}_lineage.json")
        final = _load(fname).final_protocol()
        key = json.dumps([r.model_dump(exclude={"rule_id", "author_id",
                                                "created_gen"})
                          for r in final.rules], sort_keys=True)
        if key in seen:
            report.test_accuracy[label] = dict(
                report.test_accuracy[seen[key]])
            continue
        seen[key] = label
        by_slack: dict[str, float] = {}
        for slack in TRAIN_SLACKS6 + UNSEEN_SLACKS6:
            sp = [p for p in pairs if p[2] == slack]
            by_slack[str(slack)] = evaluate(sp, config,
                                            protocol=final).mean_accuracy
        report.test_accuracy[label] = by_slack

    for tier in TIERS:
        total_in = total_out = 0
        for ms in SEEDS:
            path = os.path.join(DATA, f"mission7_calls_m7_{tier}_ms{ms}.jsonl")
            if os.path.exists(path):
                *_, last = open(path, encoding="utf-8")
                u = json.loads(last).get("provider_usage", {})
                total_in += u.get("input_tokens", 0)
                total_out += u.get("output_tokens", 0)
        report.usage[f"{tier}_input_tokens"] = total_in
        report.usage[f"{tier}_output_tokens"] = total_out

    report.verdicts = _verdicts(report)
    return report


def _passed(n_ok: int, n_total: int, need: int) -> str:
    return f"{n_ok}/{n_total} (기준 ≥{need})"


def _verdicts(report: Mission7Report) -> list[str]:
    out = []
    # P28: T reaches R's per-seed final score with <=50% of R's budget
    ok28 = 0
    detail = []
    for ms in SEEDS:
        r = report.runs[f"T_ms{ms}"]
        c = r.candidates_to_r_target
        detail.append(f"ms{ms}: {c if c else '미도달'}/{120}")
        if c is not None and c <= 60:
            ok28 += 1
    out.append(f"P28 (T 표본 효율 ≤50%): "
               + ("충족" if ok28 >= 2 else "미충족")
               + f" - {_passed(ok28, 3, 2)}, 후보 수 {', '.join(detail)}")

    # P29: ordering by mean candidates-to-target (fewer = better);
    # unreached counts as 120 (the full budget)
    means = {}
    for tier in TIERS:
        vals = [report.runs[f"{tier}_ms{ms}"].candidates_to_r_target or 120
                for ms in SEEDS]
        means[tier] = statistics.fmean(vals)
    ok29 = means["T"] <= means["S"] <= means["Z"]
    out.append(f"P29 (효율 순서 T≥S≥Z): "
               + ("충족" if ok29 else "미충족")
               + f" - 평균 도달 후보 수 T {means['T']:.0f}, "
               f"S {means['S']:.0f}, Z {means['Z']:.0f}")

    # P30: registered bar (score >= 0.85 within 20 gens, >=2/3);
    # escape events reported alongside
    esc_bar = sum(report.runs[f"Tdead_ms{ms}"].final_score >= ESCAPE_BAR
                  for ms in SEEDS)
    esc_evt = [report.runs[f"Tdead_ms{ms}"].escape_gen for ms in SEEDS]
    r_evt = [report.runs[f"Rdead_ms{ms}"].escape_gen for ms in SEEDS]
    out.append(f"P30 (탈출 score≥{ESCAPE_BAR}, ≥2/3): "
               + ("충족" if esc_bar >= 2 else "미충족")
               + f" - 기준 도달 {esc_bar}/3. 탈출 사건 자체는 T "
               f"{sum(1 for e in esc_evt if e)}/3 (세대 {esc_evt}), "
               f"R {sum(1 for e in r_evt if e)}/3")

    # P31: escaped protocols on the test grid vs C (mission6 report)
    try:
        with open(os.path.join(DATA, "mission6_report.json"),
                  encoding="utf-8") as f:
            m6 = json.load(f)
        c_train = statistics.fmean(
            m6["results"]["C"][str(s)]["mean_accuracy"]
            for s in TRAIN_SLACKS6)
        for label in ("T_ms0", "Tdead_ms0"):
            acc = statistics.fmean(report.test_accuracy[label][str(s)]
                                   for s in TRAIN_SLACKS6)
            out.append(
                f"P31 ({label} 시험 일반화 vs C {c_train:.3f}): "
                + ("충족" if acc - c_train >= MARGIN else "미충족")
                + f" - {acc:.3f} ({acc - c_train:+.3f})")
    except FileNotFoundError:
        out.append("P31: mission6_report.json 없음 - 판정 불가")
    return out


def format_report(report: Mission7Report) -> str:
    lines = ["=== 실험 7A 판정 ===", "", "검증 score (세대 20 최종):"]
    for tier in ("R",) + TIERS:
        row = [f"{report.runs[f'{tier}_ms{ms}'].final_score:.4f}"
               for ms in SEEDS]
        lines.append(f"  {tier}: " + "  ".join(row))
    lines.append("")
    lines.append("교착 탈출 (최종 score / 탈출 세대):")
    for kind in ("Rdead", "Tdead"):
        row = []
        for ms in SEEDS:
            r = report.runs[f"{kind}_ms{ms}"]
            row.append(f"{r.final_score:.4f}/"
                       f"{r.escape_gen if r.escape_gen else '-'}")
        lines.append(f"  {kind}: " + "  ".join(row))
    lines.append("")
    lines.append("시험 일반화 (T 계열 최종 프로토콜, slack별 평균 정확도):")
    for label, by_slack in report.test_accuracy.items():
        vals = "  ".join(f"{s}:{a:.3f}" for s, a in by_slack.items())
        lines.append(f"  {label}: {vals}")
    lines.append("")
    lines.append(f"토큰 사용: {report.usage}")
    lines.append("")
    lines.append("사전 등록 판정:")
    lines += [f"  {v}" for v in report.verdicts]
    return "\n".join(lines)


def save_report(path: str, report: Mission7Report) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report.model_dump(), f, ensure_ascii=False, indent=1)
