"""CLI for experiment 7.

  python -m genesis.mission7 --pilot
      Mock-provider pipeline verification: prompts render (guard on),
      responses parse, invalid path works, escape run from the deadlock
      protocol adopts a conditional-share rule, lineage audits clean.
      Mock behavior encodes the known answer — NEVER a result.

  python -m genesis.mission7 --run {R,Z,S,T} [--escape {none,deadlock}]
      [--master-seed N] [--generations 20] [--provider anthropic]
      [--model ...] [--temperature 1.0]
      One evolution run. R uses the mission-6 random proposer; Z/S/T use
      the LLM proposer at that information tier. The anthropic provider
      refuses to start without GENESIS_SPEND=i-approve.
"""

from __future__ import annotations

import argparse
import os
import time

from genesis.mission2.config import Mission2Config
from genesis.mission6.evolution import evolve
from genesis.mission6.lineage import audit, save_lineage
from genesis.mission7.proposers import (
    DEFAULT_MODEL,
    DEFAULT_TEMPERATURE,
    AnthropicProvider,
    MockProvider,
    deadlock_protocol,
    llm_proposer,
)

DATA_DIR = "data"


def tag_of(run: str, escape: str, master_seed: int, provider: str) -> str:
    parts = [f"m7_{run}"]
    if escape != "none":
        parts.append(escape)
    parts.append(f"ms{master_seed}")
    if provider != "anthropic":
        parts.append(provider)
    return "_".join(parts)


def run_one(args, config: Mission2Config) -> None:
    tag = tag_of(args.run, args.escape, args.master_seed, args.provider)
    founding = deadlock_protocol() if args.escape == "deadlock" else None
    if args.run == "R":
        proposer = None
    else:
        provider = (MockProvider() if args.provider == "mock"
                    else AnthropicProvider(args.model, args.temperature))
        proposer = llm_proposer(
            args.run, provider,
            os.path.join(DATA_DIR, f"mission7_calls_{tag}.jsonl"),
            temperature=args.temperature,
        )
    t0 = time.time()
    lineage = evolve("M", config, generations=args.generations,
                     master_seed=args.master_seed, verbose=True,
                     founding=founding, proposer=proposer)
    lineage.group = f"M7-{args.run}"
    problems = audit(lineage)
    path = os.path.join(DATA_DIR, f"mission7_{tag}_lineage.json")
    save_lineage(path, lineage)
    print(f"[{tag}] 완료 {time.time() - t0:.0f}s -> {path}")
    for p in problems:
        print(f"  !! {p}")
    if not problems:
        print("  계보 감사: 위반 0")


def run_pilot(config: Mission2Config) -> None:
    from genesis.mission6.evolution import ProposalContext, evaluate, build_pairs
    from genesis.mission7.prompts import build_prompt, guard, LeakageError

    print("=== 실험 7 파일럿: 목 제공자 기계 검증 (결과 아님) ===")
    # 1. guard self-test
    try:
        guard("this prompt mentions a descending auction")
        print("  !! 가드 실패: 금지어 미검출")
    except LeakageError:
        print("  가드: 금지어 검출 OK")

    # 2. escape run from the deadlock attractor, mock proposer, 3 gens
    provider = MockProvider()
    log = os.path.join(DATA_DIR, "mission7_calls_pilot.jsonl")
    if os.path.exists(log):
        os.remove(log)
    proposer = llm_proposer("T", provider, log)
    lineage = evolve("M", config, generations=3,
                     train_seeds=[2001, 2002, 2003],
                     valid_seeds=[2101, 2102, 2103],
                     founding=deadlock_protocol(),
                     proposer=proposer, verbose=True)
    lineage.group = "M7-pilot"
    problems = audit(lineage)
    ops = {}
    for g in lineage.generations:
        for c in g.candidates:
            ops[c.op] = ops.get(c.op, 0) + 1
    escaped = lineage.generations[-1].incumbent_score > 0.6
    print(f"  연산 분포: {ops} (invalid 경로 포함 여부 확인)")
    print(f"  탈출 (score {lineage.generations[-1].incumbent_score:.3f} > "
          f"0.6): {'OK' if escaped else '실패'}")
    print(f"  호출 로그: {log} "
          f"({sum(1 for _ in open(log, encoding='utf-8'))}행)")
    for p in problems:
        print(f"  !! {p}")
    ok = (not problems) and escaped and "invalid" in ops
    print("파일럿 판정:", "통과 - 파이프라인 기계 검증 완료" if ok
          else "실패 - 위 항목 확인")


def main() -> None:
    parser = argparse.ArgumentParser(prog="genesis.mission7")
    parser.add_argument("--pilot", action="store_true")
    parser.add_argument("--run", choices=("R", "Z", "S", "T"))
    parser.add_argument("--escape", choices=("none", "deadlock"),
                        default="none")
    parser.add_argument("--master-seed", type=int, default=0)
    parser.add_argument("--generations", type=int, default=20)
    parser.add_argument("--provider", choices=("mock", "anthropic"),
                        default="anthropic")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--temperature", type=float,
                        default=DEFAULT_TEMPERATURE)
    parser.add_argument("--report", action="store_true")
    parser.add_argument("--analyze", action="store_true")
    args = parser.parse_args()
    config = Mission2Config()

    if args.pilot:
        run_pilot(config)
        return
    if args.analyze:
        from genesis.mission7.analyze7 import run_analysis

        print(run_analysis(config))
        return
    if args.report:
        from genesis.mission7.report7 import (
            build_report,
            format_report,
            save_report,
        )

        report = build_report(config)
        print(format_report(report))
        save_report(os.path.join(DATA_DIR, "mission7_report.json"), report)
        return
    if args.run:
        run_one(args, config)
        return
    parser.print_help()


main()
