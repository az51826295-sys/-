"""CLI for experiment 6.

  python -m genesis.mission6 --pilot
      3 generations, small seed sets, all groups — mechanical audit only
      (rules are generated, adopted, rolled back; lineage is consistent).
      Performance numbers printed by the pilot are NOT results.

  python -m genesis.mission6 --group M [--generations 20]
      Full evolution for one group; lineage saved to
      data/mission6_<group>_lineage.json.

  python -m genesis.mission6 --report
      Loads every saved lineage, runs the frozen test evaluation
      (test seeds x all slacks, baselines C/E/I2/ancestor), prints the
      pre-registered verdicts, saves data/mission6_report.json.
"""

from __future__ import annotations

import argparse
import os
import time

from genesis.mission2.config import Mission2Config
from genesis.mission6.evolution import GENERATIONS, evolve
from genesis.mission6.lineage import audit, load_lineage, save_lineage

DATA_DIR = "data"
GROUPS = ("J", "K", "L", "M")


def lineage_path(group: str, pilot: bool = False, master_seed: int = 0) -> str:
    tag = "pilot_" if pilot else ""
    ms = f"_ms{master_seed}" if master_seed else ""
    return os.path.join(DATA_DIR, f"mission6_{tag}{group}{ms}_lineage.json")


def run_pilot(config: Mission2Config) -> None:
    print("=== 파일럿: 기계 검증 (3세대, 축소 seed, 성능은 결과가 아님) ===")
    train = list(range(2001, 2007))
    valid = list(range(2101, 2107))
    any_problem = False
    for group in GROUPS:
        t0 = time.time()
        lineage = evolve(group, config, generations=3,
                         train_seeds=train, valid_seeds=valid, verbose=True)
        problems = audit(lineage)
        save_lineage(lineage_path(group, pilot=True), lineage)
        gens = lineage.generations
        adopted = sum(1 for g in gens for c in g.candidates if c.adopted)
        rollbacks = sum(1 for g in gens if g.rolled_back)
        ops = {}
        for g in gens:
            for c in g.candidates:
                ops[c.op] = ops.get(c.op, 0) + 1
        print(f"[{group}] {time.time() - t0:.1f}s - 후보 "
              f"{sum(len(g.candidates) for g in gens)}개, 채택 {adopted}, "
              f"롤백/유지 {rollbacks}, 연산 {ops}")
        if problems:
            any_problem = True
            for p in problems:
                print(f"  !! {p}")
        else:
            print("  계보 감사: 위반 0")
    print()
    print("파일럿 판정:", "실패 - 위 위반 수정 필요" if any_problem
          else "통과 - 기계 검증 완료, 하이퍼파라미터 동결 가능")


def main() -> None:
    parser = argparse.ArgumentParser(prog="genesis.mission6")
    parser.add_argument("--pilot", action="store_true")
    parser.add_argument("--group", choices=GROUPS)
    parser.add_argument("--generations", type=int, default=GENERATIONS)
    parser.add_argument("--master-seed", type=int, default=0)
    parser.add_argument("--report", action="store_true")
    parser.add_argument("--ablate", action="store_true",
                        help="M 최종 프로토콜 절제 실험 (본실험 후)")
    parser.add_argument("--test-seeds", type=int, default=0,
                        help="report: seed 수 축소 (0=사전 등록 전체 40)")
    args = parser.parse_args()
    config = Mission2Config()

    if args.pilot:
        run_pilot(config)
        return

    if args.group:
        t0 = time.time()
        lineage = evolve(args.group, config, generations=args.generations,
                         master_seed=args.master_seed, verbose=True)
        problems = audit(lineage)
        path = lineage_path(args.group, master_seed=args.master_seed)
        save_lineage(path, lineage)
        print(f"[{args.group}] 완료 {time.time() - t0:.0f}s -> {path}")
        for p in problems:
            print(f"  !! {p}")
        if not problems:
            print("  계보 감사: 위반 0")
        return

    if args.report:
        from genesis.mission6.evolution import TEST_SEEDS6
        from genesis.mission6.report6 import (
            build_report,
            format_report,
            save_report,
        )

        lineages = {}
        for group in GROUPS:
            path = lineage_path(group)
            if os.path.exists(path):
                lineages[group] = load_lineage(path)
        if not lineages:
            print("저장된 계보가 없음 — 먼저 --group 실행")
            return
        seeds = (TEST_SEEDS6[: args.test_seeds]
                 if args.test_seeds else None)
        report = build_report(config, lineages, test_seeds=seeds)
        print(format_report(report))
        save_report(os.path.join(DATA_DIR, "mission6_report.json"), report)
        return

    if args.ablate:
        from genesis.mission6.ablation import (
            format_ablation,
            leave_one_rule_out,
            parameter_reset,
            priority_shuffle,
            random_search,
            seeded_stability,
        )

        lineage = load_lineage(lineage_path("M"))
        final = lineage.final_protocol()
        seeds = (list(range(3001, 3001 + args.test_seeds))
                 if args.test_seeds else None)
        loo = leave_one_rule_out(final, config, test_seeds=seeds)
        shuffles = priority_shuffle(final, config, test_seeds=seeds)
        resets = parameter_reset(final, config, test_seeds=seeds)
        _, rand_valid, rand_test = random_search(config, test_seeds=seeds)
        stability = seeded_stability(final, config)
        print(format_ablation(loo, shuffles, resets, rand_valid,
                              rand_test, stability))
        return

    parser.print_help()


main()
