"""Ablations (design section 6): decompose M's improvement into
expression-space, search-procedure, and discovered-rule effects.

1. leave-one-rule-out          — causal contribution of each rule
2. priority shuffle            — does rule *order* carry the function?
3. parameter reset             — init_threshold and condition values
4. random search, same budget  — expression space + selection without
                                 inheritance (no lineage, no incumbents)
5. discovered protocol as seed — is it stable under further evolution?
6. re-discovery                — rerun evolve() with other master seeds
                                 (handled via --group M --master-seed N)
"""

from __future__ import annotations

import random
import statistics

from genesis.mission2.config import Mission2Config
from genesis.mission6.dsl import (
    METRICS,
    Protocol,
    ancestor_protocol,
    random_rule,
    validate_protocol,
)
from genesis.mission6.evolution import (
    GENERATIONS,
    TEST_SEEDS6,
    TRAIN_SLACKS6,
    VALID_SEEDS6,
    build_pairs,
    evaluate,
)
from genesis.mission6.lineage import EvalStats


def _test_pairs(config: Mission2Config, test_seeds: list[int] | None = None):
    return build_pairs(test_seeds or TEST_SEEDS6, TRAIN_SLACKS6, config,
                       cycle=False)


def leave_one_rule_out(
    final: Protocol, config: Mission2Config,
    test_seeds: list[int] | None = None,
) -> list[tuple[str, EvalStats]]:
    """Full protocol first, then each rule removed. If removal empties the
    protocol it degenerates to all-PASS (executor safety net drives it)."""
    pairs = _test_pairs(config, test_seeds)
    out = [("full", evaluate(pairs, config, protocol=final))]
    for rule in final.rules:
        reduced = final.model_copy(deep=True)
        reduced.rules = [r for r in reduced.rules if r.rule_id != rule.rule_id]
        out.append((f"-{rule.rule_id}",
                    evaluate(pairs, config, protocol=reduced)))
    return out


def priority_shuffle(
    final: Protocol, config: Mission2Config, n: int = 5,
    test_seeds: list[int] | None = None,
) -> list[EvalStats]:
    pairs = _test_pairs(config, test_seeds)
    out = []
    for i in range(n):
        rng = random.Random(f"m6:ablate:shuffle:{i}")
        shuffled = final.model_copy(deep=True)
        prios = [r.priority for r in shuffled.rules]
        rng.shuffle(prios)
        for r, p in zip(shuffled.rules, prios):
            r.priority = p
        out.append(evaluate(pairs, config, protocol=shuffled))
    return out


def parameter_reset(
    final: Protocol, config: Mission2Config,
    test_seeds: list[int] | None = None,
) -> dict[str, EvalStats]:
    """threshold-reset: init_threshold back to the ancestor's 0.0.
    value-reset: every condition value re-drawn from its metric grid."""
    pairs = _test_pairs(config, test_seeds)
    thr = final.model_copy(deep=True)
    thr.init_threshold = 0.0
    rng = random.Random("m6:ablate:values")
    val = final.model_copy(deep=True)
    for r in val.rules:
        for c in r.conditions:
            c.value = float(rng.choice(METRICS[c.metric]))
    return {
        "threshold_reset": evaluate(pairs, config, protocol=thr),
        "value_reset": evaluate(pairs, config, protocol=val),
    }


def random_search(
    config: Mission2Config,
    budget_candidates: int = GENERATIONS * 6,
    valid_seeds: list[int] | None = None,
    test_seeds: list[int] | None = None,
) -> tuple[Protocol, EvalStats, EvalStats]:
    """Fresh random protocols (1-8 random rules + random init_threshold),
    same number of blind evaluations M spent, best-of on validation, then
    scored on the test set. No inheritance between candidates."""
    valid_pairs = build_pairs(valid_seeds or VALID_SEEDS6, TRAIN_SLACKS6,
                              config, cycle=False)
    best: tuple[Protocol, EvalStats] | None = None
    for i in range(budget_candidates):
        rng = random.Random(f"m6:ablate:rand:{i}")
        protocol = Protocol(
            version=0,
            rules=[
                random_rule(rng, f"rs{i}-{j}", "random", 0)
                for j in range(rng.randint(1, 8))
            ],
            init_threshold=round(rng.choice(
                (0.0, 0.1, 0.2, 0.3, 0.5, 0.7)), 2),
        )
        assert validate_protocol(protocol) == []
        stats = evaluate(valid_pairs, config, protocol=protocol)
        if best is None or stats.score > best[1].score:
            best = (protocol, stats)
    test_stats = evaluate(_test_pairs(config, test_seeds), config,
                          protocol=best[0])
    return best[0], best[1], test_stats


def seeded_stability(
    final: Protocol, config: Mission2Config, generations: int = 5,
    train_seeds: list[int] | None = None,
    valid_seeds: list[int] | None = None,
) -> list[float]:
    """Ablation 5: continue evolving M from the discovered protocol; a
    real optimum should mostly hold (rollbacks, few adoptions)."""
    from genesis.mission6.evolution import evolve

    seeded = final.model_copy(deep=True)
    seeded.version = 0
    seeded.parent_version = None
    lineage = evolve("M", config, generations=generations,
                     train_seeds=train_seeds, valid_seeds=valid_seeds,
                     master_seed=999, founding=seeded)
    return [g.incumbent_score for g in lineage.generations]


def format_ablation(
    loo: list[tuple[str, EvalStats]],
    shuffles: list[EvalStats],
    resets: dict[str, EvalStats],
    rand_valid: EvalStats,
    rand_test: EvalStats,
    stability: list[float],
) -> str:
    full = loo[0][1]
    lines = [
        "=== 절제 실험 (M 최종 프로토콜, 시험 seed × 훈련 slack) ===",
        "",
        f"전체 프로토콜: acc {full.mean_accuracy:.3f}, score {full.score:.4f}",
        "",
        "1. 규칙 개별 제거 (Δacc = 제거 후 - 전체):",
    ]
    for name, st in loo[1:]:
        lines.append(f"   {name:<28s} acc {st.mean_accuracy:.3f} "
                     f"(Δ {st.mean_accuracy - full.mean_accuracy:+.3f})")
    accs = [s.mean_accuracy for s in shuffles]
    lines += [
        "",
        f"2. 우선순위 무작위화 ({len(shuffles)}회): "
        f"acc 평균 {statistics.fmean(accs):.3f} "
        f"(범위 {min(accs):.3f}~{max(accs):.3f}, 전체 {full.mean_accuracy:.3f})",
        "",
        "3. 파라미터 초기화:",
        f"   init_threshold 초기화: acc {resets['threshold_reset'].mean_accuracy:.3f} "
        f"(Δ {resets['threshold_reset'].mean_accuracy - full.mean_accuracy:+.3f})",
        f"   조건값 재추첨:        acc {resets['value_reset'].mean_accuracy:.3f} "
        f"(Δ {resets['value_reset'].mean_accuracy - full.mean_accuracy:+.3f})",
        "",
        f"4. 무학습 무작위 탐색 (동일 평가 예산): 검증 score "
        f"{rand_valid.score:.4f}, 시험 acc {rand_test.mean_accuracy:.3f} "
        f"(M 전체 {full.mean_accuracy:.3f})",
        "",
        f"5. 발견 프로토콜 재시작 안정성 (5세대 score): "
        + " -> ".join(f"{s:.4f}" for s in stability),
    ]
    return "\n".join(lines)
