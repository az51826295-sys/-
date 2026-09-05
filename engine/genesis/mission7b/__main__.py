"""CLI for mission 7B (pre-registration draft stage).

  python -m genesis.mission7b --space
      Print the rule-space size per feature combination (design
      section 1 — the registered evidence for random-search collapse).

  python -m genesis.mission7b --pilot
      Mock-provider mechanical verification of the full 7B pipeline
      on the generic loop runner (never a result).

  python -m genesis.mission7b --run {R,Z,S,T,TM} [--master-seed N]
      [--generations 20] [--provider anthropic|mock]
      One evolution run on the generic runner with registry resume.
      Anthropic provider stays behind GENESIS_SPEND=i-approve.
"""

from __future__ import annotations

import argparse
import os
import time

from genesis.loop.registry import Registry
from genesis.loop.runner import BlindSelector, Runner
from genesis.mission2.config import Mission2Config
from genesis.mission6.evolution import TRAIN_SEEDS6, TRAIN_SLACKS6, VALID_SEEDS6
from genesis.mission7b.dsl7b import (
    Features,
    Protocol7B,
    ancestor_protocol7b,
    rule_space_size,
)
from genesis.mission7b.environment import Clue7BEnvironment
from genesis.mission7b.proposers7b import (
    LLMProposer7B,
    MockProvider7B,
    RandomProposer7B,
)

DATA = "data"


def make_runner(args, config: Mission2Config, features: Features,
                train, valid, tag: str) -> Runner:
    env = Clue7BEnvironment(config, train, valid, TRAIN_SLACKS6)
    if args.run == "R":
        proposer = RandomProposer7B(features, args.master_seed)
    else:
        if args.provider == "mock":
            provider = MockProvider7B()
        else:
            from genesis.mission7.proposers import AnthropicProvider
            provider = AnthropicProvider(args.model, args.temperature)
        proposer = LLMProposer7B(
            args.run, features, provider,
            os.path.join(DATA, f"mission7b_calls_{tag}.jsonl"),
            temperature=args.temperature)
    return Runner(
        environment=env,
        proposer=proposer,
        selector=BlindSelector(),
        registry=Registry(
            os.path.join(DATA, f"mission7b_{tag}_registry.json"),
            f"mission7b_{tag}"),
        artifact_load=Protocol7B.model_validate,
        artifact_dump=lambda p: p.model_dump(),
        proposals_per_gen=config.n_agents,
        log=lambda s: print(f"[{tag}] {s}", flush=True),
    )


def run_pilot(config: Mission2Config) -> None:
    print("=== 7B 파일럿: 목 제공자 기계 검증 (결과 아님) ===")
    features = Features()
    train, valid = [2001, 2002, 2003], [2101, 2102, 2103]

    class A:
        run, provider, master_seed = "TM", "mock", 0
        model, temperature = "", 1.0

    tag = "pilot"
    reg_path = os.path.join(DATA, f"mission7b_{tag}_registry.json")
    calls_path = os.path.join(DATA, f"mission7b_calls_{tag}.jsonl")
    for p in (reg_path, calls_path):
        if os.path.exists(p):
            os.remove(p)
    runner = make_runner(A, config, features, train, valid, tag)
    runner.run(ancestor_protocol7b(), generations=3)
    st = runner.registry.state
    ops = {}
    for g in st.generations:
        for c in g.candidates:
            ops[c["op"]] = ops.get(c["op"], 0) + 1
    def has_7b_vocab(dump: dict) -> bool:
        p = Protocol7B.model_validate(dump)
        return any(
            r.role is not None or len(r.actions) > 1
            or any(a.name in ("SET_MODE", "CLEAR_MODE")
                   for a in r.actions)
            or any(c.metric in ("consecutive_all_pass", "my_mode",
                                "total_shares", "mean_recent_gain",
                                "active_speaker_count",
                                "rounds_since_my_action")
                   for c in r.conditions)
            for r in p.rules)

    # mechanics check: 7B vocabulary must flow through propose->parse->
    # validate->evaluate; adoption is the evaluator's call, not ours
    used_7b_vocab = any(
        c["op"] != "invalid" and has_7b_vocab(c["artifact"])
        for g in st.generations for c in g.candidates)
    calls = sum(1 for _ in open(calls_path, encoding="utf-8"))
    checks = {
        "세대 3 완료": len(st.generations) == 3,
        "invalid 경로 사용": "invalid" in ops,
        "7B 어휘 채택": used_7b_vocab,
        "호출 로그 18행": calls == 18,
        "score 개선": st.generations[-1].incumbent_score
        > st.generations[0].incumbent_score - 1e-9,
    }
    for name, ok in checks.items():
        print(f"  {name}: {'OK' if ok else '실패'}")
    print(f"  연산 분포: {ops}")
    print("파일럿 판정:",
          "통과 - 기계 검증 완료" if all(checks.values()) else "실패")


def main() -> None:
    parser = argparse.ArgumentParser(prog="genesis.mission7b")
    parser.add_argument("--pilot", action="store_true")
    parser.add_argument("--space", action="store_true")
    parser.add_argument("--run",
                        choices=("R", "Z", "S", "T", "TM", "TP", "TS"))
    parser.add_argument("--escape", choices=("none", "deadlock"),
                        default="none")
    parser.add_argument("--attractors", action="store_true",
                        help="끌개 2종의 검증 score 출력 (등록 근거)")
    parser.add_argument("--prompt-size", action="store_true",
                        help="계층별 프롬프트 토큰 추정 (비용 산정)")
    parser.add_argument("--master-seed", type=int, default=0)
    parser.add_argument("--generations", type=int, default=20)
    parser.add_argument("--provider", choices=("mock", "anthropic"),
                        default="anthropic")
    parser.add_argument("--model", default="claude-haiku-4-5-20251001")
    parser.add_argument("--temperature", type=float, default=1.0)
    args = parser.parse_args()
    config = Mission2Config()

    if args.attractors:
        from genesis.mission7b.attractors import deadlock_protocol7b
        from genesis.mission7b.environment import evaluate7b
        from genesis.mission6.evolution import build_pairs

        valid = build_pairs(list(VALID_SEEDS6), TRAIN_SLACKS6, config,
                            cycle=False)
        for name, p in (("전면 공유 (시조)", ancestor_protocol7b()),
                        ("전면 억제 (교착)", deadlock_protocol7b())):
            st = evaluate7b(valid, config, p)
            print(f"  {name}: score {st.score:.4f}, "
                  f"acc {st.mean_accuracy:.3f}")
        return
    if args.prompt_size:
        from genesis.mission7b.environment import Clue7BEnvironment
        from genesis.mission7b.prompts7b import build_prompt7b

        env = Clue7BEnvironment(config, [2001, 2002, 2003],
                                [2101], (1.0,))
        obs = env.observe(ancestor_protocol7b())
        history = [{"gen": 1, "rolled_back": True,
                    "incumbent_score": 0.5,
                    "candidates": [{"op": "add", "score": 0.4,
                                    "adopted": False}] * 6}] * 5
        for tier in ("Z", "S", "T", "TM"):
            prompt = build_prompt7b(tier, Features(),
                                    ancestor_protocol7b(), obs, history,
                                    True)
            print(f"  {tier}: {len(prompt):,}자 (~{len(prompt) // 4:,}"
                  f" 토큰)")
        return
    if args.space:
        for flags in (Features(modes=False, roles=False, chains=False,
                               social=False),
                      Features()):
            label = ("7A-상당 (확장 전부 꺼짐)"
                     if not flags.modes else "7B 전체")
            print(f"  {label}: 단일 규칙 공간 {rule_space_size(flags):,}")
        return
    if args.pilot:
        run_pilot(config)
        return
    if args.run:
        features = Features()
        tag = f"{args.run}_ms{args.master_seed}"
        if args.escape != "none":
            tag = f"{args.run}_{args.escape}_ms{args.master_seed}"
        if args.temperature != 1.0:
            tag += f"_t{args.temperature}"
        if args.provider == "mock":
            tag += "_mock"
        runner = make_runner(args, config, features,
                             list(TRAIN_SEEDS6), list(VALID_SEEDS6), tag)
        if args.escape == "deadlock":
            from genesis.mission7b.attractors import deadlock_protocol7b
            founding = deadlock_protocol7b()
        else:
            founding = ancestor_protocol7b()
        t0 = time.time()
        runner.run(founding, generations=args.generations)
        print(f"[{tag}] 완료 {time.time() - t0:.0f}s")
        return
    parser.print_help()


main()
