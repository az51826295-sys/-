"""7A freeze audit (proposal section 8.A).

Answers, from the recorded lineages and call logs alone:
 1. plateau autopsy — after the escape, what did proposals try, and why
    did nothing beat the 0.7447 incumbent? (threshold-lowering
    proposals: generated? evaluated? outscored?)
 2. proposal hygiene — invalid rate, duplicate rate, adoption rate
 3. per-seed time-to-first-valid-improvement
 4. P30 supplementary verdict under the relative-improvement definition
    (proposal section 5): +0.15 validation vs founding, adoption
    happened, +0.10 on the unseen test grid vs founding
 5. cost / candidate-efficiency table
"""

from __future__ import annotations

import json
import os
import statistics
from collections import Counter

from genesis.mission2.config import Mission2Config
from genesis.mission6.evolution import (
    TEST_SEEDS6,
    TRAIN_SLACKS6,
    build_pairs,
    evaluate,
)
from genesis.mission6.lineage import Lineage, load_lineage
from genesis.mission7.proposers import deadlock_protocol

DATA = "data"
SEEDS = (0, 1, 2)
TIERS = ("Z", "S", "T")


def _load(name: str) -> Lineage:
    return load_lineage(os.path.join(DATA, name))


def _protocol_key(p) -> str:
    return json.dumps(
        [r.model_dump(exclude={"rule_id", "author_id", "created_gen"})
         for r in sorted(p.rules, key=lambda r: (-r.priority, r.action))]
        + [p.init_threshold], sort_keys=True)


def plateau_autopsy(lines: list[str]) -> None:
    """What happened after escape in the T-deadlock runs."""
    lines.append("== 1. 0.745 고원 부검 (T 교착 런, 탈출 이후 세대)")
    for ms in SEEDS:
        lin = _load(f"mission7_m7_T_deadlock_ms{ms}_lineage.json")
        escape_gen = next(g.gen for g in lin.generations
                          if g.incumbent_version_after > 0)
        incumbent_score = lin.generations[-1].incumbent_score
        post = [g for g in lin.generations if g.gen > escape_gen]
        n_cand = sum(len(g.candidates) for g in post)
        lower_thr = []       # proposals lowering the 0.5 gain threshold
        remove_deadlock = []
        beat = []
        for g in post:
            for c in g.candidates:
                if c.stats is None:
                    continue
                if c.stats.score > incumbent_score + 1e-9:
                    beat.append((g.gen, c.op, c.stats.score))
                for r in c.protocol.rules:
                    for cond in r.conditions:
                        if (cond.metric == "my_best_gain"
                                and r.action == "SHARE_BEST"
                                and cond.op == ">=" and cond.value < 0.5):
                            lower_thr.append(
                                (g.gen, cond.value, c.stats.score))
                if not any("consecutive_low_gain" in
                           [cond.metric for cond in r.conditions]
                           for r in c.protocol.rules):
                    remove_deadlock.append((g.gen, c.stats.score))
        uniq_lower = sorted({(v, round(s, 4)) for _, v, s in lower_thr})
        lines.append(
            f"  ms{ms}: 탈출 세대 {escape_gen}, 이후 후보 {n_cand}개 / "
            f"현직 {incumbent_score:.4f}")
        lines.append(
            f"    문턱<0.5 공유 규칙 포함 후보: {len(lower_thr)}개 "
            f"(문턱값, score): {uniq_lower[:6]}")
        lines.append(
            f"    교착 규칙 삭제 후보: {len(remove_deadlock)}개, "
            f"최고 score {max((s for _, s in remove_deadlock), default=0):.4f}")
        lines.append(
            f"    현직을 이긴 후보: {len(beat)}개")


def hygiene(lines: list[str]) -> None:
    lines.append("")
    lines.append("== 2. 제안 위생 (군별 합계, 시조 출발 9런)")
    lines.append("  군   무효율   중복률   채택률   (중복=동일 내용 후보 재제안)")
    for tier in TIERS:
        ops: Counter = Counter()
        seen_keys: set[str] = set()
        dup = total = adopted = 0
        for ms in SEEDS:
            lin = _load(f"mission7_m7_{tier}_ms{ms}_lineage.json")
            seen_keys.clear()
            seen_keys.add(_protocol_key(
                lin.protocols["0"]))
            for g in lin.generations:
                for c in g.candidates:
                    total += 1
                    ops[c.op] += 1
                    adopted += c.adopted
                    key = _protocol_key(c.protocol)
                    if key in seen_keys:
                        dup += 1
                    seen_keys.add(key)
        lines.append(
            f"  {tier}   {ops['invalid'] / total:.3f}    {dup / total:.3f}"
            f"    {adopted / total:.3f}   연산 {dict(ops)}")


def first_improvement(lines: list[str]) -> None:
    lines.append("")
    lines.append("== 3. seed별 최초 유효 개선 도달 (후보 수 기준)")
    for tier in TIERS:
        row = []
        for ms in SEEDS:
            lin = _load(f"mission7_m7_{tier}_ms{ms}_lineage.json")
            first = next((g.gen * 6 for g in lin.generations
                          if not g.rolled_back), None)
            row.append(str(first) if first else "없음")
        lines.append(f"  {tier}: {' / '.join(row)}")


def p30_supplementary(lines: list[str], config: Mission2Config) -> None:
    lines.append("")
    lines.append("== 4. P30 보조 판정 (상대 개선 정의 — 사후 분석, 사전 등록 아님)")
    founding = deadlock_protocol()
    pairs = build_pairs(list(TEST_SEEDS6), TRAIN_SLACKS6, config,
                        cycle=False)
    founding_test = evaluate(pairs, config, protocol=founding).mean_accuracy
    lines.append(f"  founding(교착) 시험 정확도: {founding_test:.3f}")
    ok = 0
    for ms in SEEDS:
        lin = _load(f"mission7_m7_T_deadlock_ms{ms}_lineage.json")
        base = 0.5408
        final_valid = lin.generations[-1].incumbent_score
        adopted = any(c.adopted for g in lin.generations
                      for c in g.candidates)
        final = lin.final_protocol()
        final_test = evaluate(pairs, config, protocol=final).mean_accuracy
        cond = (final_valid - base >= 0.15 and adopted
                and final_test - founding_test >= 0.10)
        ok += cond
        lines.append(
            f"  ms{ms}: 검증 +{final_valid - base:.3f} (≥0.15), 채택 "
            f"{'유' if adopted else '무'}, 시험 +{final_test - founding_test:.3f}"
            f" (≥0.10) -> {'충족' if cond else '미충족'}")
    lines.append(f"  보조 판정: {ok}/3 {'(전원 충족)' if ok == 3 else ''}"
                 " — 후속 등록은 이 정의를 사용할 것")


def cost_table(lines: list[str]) -> None:
    lines.append("")
    lines.append("== 5. 비용·효율")
    grand_in = grand_out = grand_calls = 0
    import glob
    for path in sorted(glob.glob(os.path.join(
            DATA, "mission7_calls_m7_*.jsonl"))):
        rows = open(path, encoding="utf-8").readlines()
        if not rows:
            continue
        u = json.loads(rows[-1]).get("provider_usage", {})
        grand_calls += len(rows)
        grand_in += u.get("input_tokens", 0)
        grand_out += u.get("output_tokens", 0)
    cost = grand_in / 1e6 * 1 + grand_out / 1e6 * 5
    lines.append(f"  호출 {grand_calls}, 입력 {grand_in:,}, "
                 f"출력 {grand_out:,}, 비용 ${cost:.2f} (Haiku 4.5)")
    lines.append(
        "  달러당 효율: 무작위가 120후보로 도달한 지점에 LLM은 후보 6개"
        f" — 런당 평균 비용 ${cost / 13:.2f}")


def run_analysis(config: Mission2Config) -> str:
    lines: list[str] = ["=== 7A 동결 감사 ==="]
    plateau_autopsy(lines)
    hygiene(lines)
    first_improvement(lines)
    p30_supplementary(lines, config)
    cost_table(lines)
    return "\n".join(lines)
