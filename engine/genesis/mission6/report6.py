"""Test-set evaluation and the pre-registered verdicts (design section 5).

Baselines run on the same instances and budgets:
  C  — free cooperation (experiment 5's fidelity-instrumented rebuild)
  E  — central coordinator (experiment 3)
  I2 — human-designed descending-threshold protocol, cold stats
       (experiment 5 showed learning contributed nothing) — comparison
       only, never part of the search space.
"""

from __future__ import annotations

import json
import statistics

from pydantic import BaseModel, Field

from genesis.mission2.config import Mission2Config
from genesis.mission2.exp3 import run_central, tier_instance
from genesis.mission2.exp4 import min_certificate
from genesis.mission2.exp5 import SocietyStats, run_c_with_fidelity, run_i2
from genesis.mission6.dsl import Protocol, ancestor_protocol
from genesis.mission6.evolution import (
    TEST_SEEDS6,
    TRAIN_SLACKS6,
    UNSEEN_SLACKS6,
    build_pairs,
)
from genesis.mission6.executor import run_protocol
from genesis.mission6.lineage import Lineage

MARGIN = 0.02          # pre-registered superiority margin (ties below it)
ALL_SLACKS = TRAIN_SLACKS6 + UNSEEN_SLACKS6


class SlackStats(BaseModel):
    slack: float
    mean_accuracy: float
    solved: int
    n: int
    comm_ratio: float = 0.0
    weak_share_rate: float = 0.0
    pass_rate: float = 0.0
    fidelity: float = 0.0
    forced_share_rate: float = 0.0


class Mission6Report(BaseModel):
    test_seeds: list[int]
    slacks: list[float]
    # group/baseline -> str(slack) -> stats
    results: dict[str, dict[str, SlackStats]] = Field(default_factory=dict)
    # M's discovered rules that actually fired on the test set
    m_new_rules: list[dict] = Field(default_factory=list)
    verdicts: list[str] = Field(default_factory=list)


def _protocol_slack_stats(
    pairs, config: Mission2Config,
    protocol: Protocol | None = None,
    per_agent: list[Protocol] | None = None,
) -> tuple[dict[str, SlackStats], dict[str, int]]:
    by_slack: dict[float, list] = {}
    fires: dict[str, int] = {}
    for inst, budget, slack in pairs:
        r = run_protocol(inst, config, budget, protocol=protocol,
                         per_agent=per_agent)
        by_slack.setdefault(slack, []).append(r)
        for rid, n in r.rule_fires.items():
            fires[rid] = fires.get(rid, 0) + n
    out = {}
    for slack, rs in by_slack.items():
        out[str(slack)] = SlackStats(
            slack=slack,
            mean_accuracy=statistics.fmean(x.expected_accuracy for x in rs),
            solved=sum(x.solved for x in rs),
            n=len(rs),
            comm_ratio=statistics.fmean(
                x.shares_used / x.share_budget for x in rs),
            weak_share_rate=statistics.fmean(x.weak_share_rate for x in rs),
            pass_rate=statistics.fmean(x.pass_rate for x in rs),
            fidelity=statistics.fmean(x.fidelity for x in rs),
            forced_share_rate=statistics.fmean(
                1.0 if x.forced_shares else 0.0 for x in rs),
        )
    return out, fires


def _baseline_slack_stats(
    pairs, config: Mission2Config, which: str
) -> dict[str, SlackStats]:
    by_slack: dict[float, list] = {}
    for inst, budget, slack in pairs:
        if which == "C":
            r = run_c_with_fidelity(inst, config, budget)
            row = (r.expected_accuracy, r.solved, r.shares_used / budget,
                   r.fidelity)
        elif which == "E":
            r = run_central(inst, config, "medium", "E", budget=budget)
            row = (r.expected_accuracy, r.solved, r.shares_used / budget, 0.0)
        elif which == "I2":
            r = run_i2(inst, config, budget, SocietyStats(), learn=False)
            row = (r.expected_accuracy, r.solved, r.shares_used / budget,
                   r.fidelity)
        else:
            raise ValueError(which)
        by_slack.setdefault(slack, []).append(row)
    out = {}
    for slack, rows in by_slack.items():
        out[str(slack)] = SlackStats(
            slack=slack,
            mean_accuracy=statistics.fmean(r[0] for r in rows),
            solved=sum(r[1] for r in rows),
            n=len(rows),
            comm_ratio=statistics.fmean(r[2] for r in rows),
            fidelity=statistics.fmean(r[3] for r in rows),
        )
    return out


def _mean_over(stats: dict[str, SlackStats], slacks) -> float:
    return statistics.fmean(stats[str(s)].mean_accuracy for s in slacks)


def build_report(
    config: Mission2Config,
    lineages: dict[str, Lineage],
    test_seeds: list[int] | None = None,
) -> Mission6Report:
    seeds = test_seeds or TEST_SEEDS6
    pairs = build_pairs(seeds, ALL_SLACKS, config, cycle=False)
    report = Mission6Report(test_seeds=seeds, slacks=list(ALL_SLACKS))

    for name in ("C", "E", "I2"):
        report.results[name] = _baseline_slack_stats(pairs, config, name)
    anc, _ = _protocol_slack_stats(pairs, config,
                                   protocol=ancestor_protocol())
    report.results["ancestor"] = anc

    m_fires: dict[str, int] = {}
    for group, lineage in lineages.items():
        if lineage.final_per_agent is not None:
            stats, fires = _protocol_slack_stats(
                pairs, config, per_agent=lineage.final_per_agent)
        else:
            stats, fires = _protocol_slack_stats(
                pairs, config, protocol=lineage.final_protocol())
        report.results[group] = stats
        if group == "M":
            m_fires = fires

    if "M" in lineages and lineages["M"].final_per_agent is None:
        final = lineages["M"].final_protocol()
        for rule in final.rules:
            # ancestral content = no conditions, SHARE_BEST; anything else
            # (including a mutated r0) counts as generated
            is_ancestral = (
                not rule.conditions and rule.action == "SHARE_BEST"
            )
            if rule.created_gen >= 1 or not is_ancestral:
                report.m_new_rules.append({
                    "rule_id": rule.rule_id,
                    "author": rule.author_id,
                    "created_gen": rule.created_gen,
                    "conditions": [c.model_dump() for c in rule.conditions],
                    "action": rule.action,
                    "priority": rule.priority,
                    "test_fires": m_fires.get(rule.rule_id, 0),
                })

    report.verdicts = _verdicts(report, lineages)
    return report


def _verdicts(report: Mission6Report, lineages: dict[str, Lineage]) -> list[str]:
    res = report.results
    out: list[str] = []

    def beats(a: str, b: str, slacks) -> bool:
        return _mean_over(res[a], slacks) - _mean_over(res[b], slacks) >= MARGIN

    def line(pid: str, ok: bool | None, detail: str) -> str:
        mark = "충족" if ok else ("미충족" if ok is False else "판정 불가")
        return f"{pid}: {mark} - {detail}"

    ts = TRAIN_SLACKS6
    if "J" in res:
        ok = beats("J", "C", ts) and not beats("J", "I2", ts) and (
            _mean_over(res["I2"], ts) - _mean_over(res["J"], ts) >= MARGIN)
        out.append(line("P20 (C < J < I2)", ok,
                        f"C {_mean_over(res['C'], ts):.3f}, "
                        f"J {_mean_over(res['J'], ts):.3f}, "
                        f"I2 {_mean_over(res['I2'], ts):.3f}"))
    if "K" in res and "M" in res and "J" in res:
        ok = beats("K", "J", ts) and beats("M", "J", ts)
        out.append(line("P21 (K·M > J)", ok,
                        f"J {_mean_over(res['J'], ts):.3f}, "
                        f"K {_mean_over(res['K'], ts):.3f}, "
                        f"M {_mean_over(res['M'], ts):.3f}"))
    if "M" in lineages and lineages["M"].final_per_agent is None:
        fired = [r for r in report.m_new_rules if r["test_fires"] > 0]
        out.append(line("P22 (생성·채택된 신규 규칙 존재)", bool(fired),
                        f"시조 외 규칙 {len(report.m_new_rules)}개, "
                        f"그중 시험에서 발화 {len(fired)}개"))
    if "M" in res:
        drop = _mean_over(res["M"], ts) - _mean_over(res["ancestor"], ts)
        out.append(line("P23 (제거 시 하락 ≥ 0.05)", drop >= 0.05,
                        f"M − 시조 = {drop:+.3f}"))
        ok24 = beats("M", "C", ts)
        out.append(line("P24 (미관측 seed 유지)", ok24,
                        f"시험 seed에서 M − C = "
                        f"{_mean_over(res['M'], ts) - _mean_over(res['C'], ts):+.3f}"))
        us = UNSEEN_SLACKS6
        ok25 = beats("M", "C", us)
        out.append(line("P25 (미관측 slack 유지)", ok25,
                        f"slack {us}: M {_mean_over(res['M'], us):.3f} vs "
                        f"C {_mean_over(res['C'], us):.3f}"))
        m15 = res["M"][str(1.5)] if str(1.5) in res["M"] else None
        i15 = res["I2"][str(1.5)] if str(1.5) in res["I2"] else None
        if m15 and i15:
            out.append(
                "P26 (기능 유사성, 기술 통계): "
                f"약공유율 M {m15.weak_share_rate:.3f}, "
                f"양보율(pass) M {m15.pass_rate:.3f}, "
                f"충실도 M {m15.fidelity:.3f} vs I2 {i15.fidelity:.3f}"
            )
        gens = lineages["M"].generations if "M" in lineages else []
        if gens:
            train_gain = gens[-1].train.mean_accuracy - gens[0].train.mean_accuracy
            test_gain = _mean_over(res["M"], ts) - _mean_over(res["ancestor"], ts)
            ok27 = not (train_gain >= MARGIN and test_gain < MARGIN)
            out.append(line("P27 (훈련만 개선 시 불인정)", ok27,
                            f"훈련 이득 {train_gain:+.3f}, 시험 이득 {test_gain:+.3f}"))
    return out


def format_report(report: Mission6Report) -> str:
    lines = [
        f"=== 실험 6: 시험 seed {len(report.test_seeds)}개 × "
        f"slack {report.slacks} ===",
        "",
        "정확도 평균 (행=slack; *=미관측 slack):",
    ]
    names = [n for n in ("C", "E", "I2", "ancestor", "J", "K", "L", "M")
             if n in report.results]
    lines.append("  slack   " + "  ".join(f"{n:>8s}" for n in names))
    for s in report.slacks:
        star = "*" if s in UNSEEN_SLACKS6 else " "
        row = f"  {s:<6}{star}"
        for n in names:
            st = report.results[n].get(str(s))
            row += f"  {st.mean_accuracy:8.3f}" if st else "       -"
        lines.append(row)
    lines += ["", "도달 seed 수:"]
    lines.append("  slack   " + "  ".join(f"{n:>8s}" for n in names))
    for s in report.slacks:
        star = "*" if s in UNSEEN_SLACKS6 else " "
        row = f"  {s:<6}{star}"
        for n in names:
            st = report.results[n].get(str(s))
            row += f"  {st.solved:8d}" if st else "       -"
        lines.append(row)
    if report.m_new_rules:
        lines += ["", "M이 생성·채택한 규칙 (시조 외):"]
        for r in report.m_new_rules:
            conds = " AND ".join(
                f"{c['metric']} {c['op']} {c['value']}"
                for c in r["conditions"]) or "ALWAYS"
            lines.append(
                f"  {r['rule_id']} (gen {r['created_gen']}, {r['author']}): "
                f"IF {conds} THEN {r['action']} P{r['priority']} "
                f"[시험 발화 {r['test_fires']}]")
    lines += ["", "사전 등록 판정:"]
    lines += [f"  {v}" for v in report.verdicts]
    return "\n".join(lines)


def save_report(path: str, report: Mission6Report) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report.model_dump(), f, ensure_ascii=False, indent=1)
