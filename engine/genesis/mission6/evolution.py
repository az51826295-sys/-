"""Generation loop and the four adoption institutions (design section 3).

Groups:
  J — one protocol per agent; each agent mutates only its own slot and
      keeps the change if the society's validation score improves.
  K — shared protocol; adoption by plurality vote, each voter judging
      candidates on its own small sample (experiment 1's voting warning
      reused as an institutional variable). No rollback safeguard.
  M — shared protocol; blind evaluation on the fixed validation grid,
      best protocol_score adopted, incumbent retained if none beat it.
  L — like M but every proposal comes from one dedicated designer agent
      (search ceiling; success must not be read as spontaneous).

The proposers are random rule operations in the deterministic pilot —
failure summaries are logged but never fed back into proposal
generation, so performance acts only through the selection step.
"""

from __future__ import annotations

import random
import statistics
from typing import Callable

from pydantic import BaseModel

from genesis.mission2.clues import Instance
from genesis.mission2.config import Mission2Config
from genesis.mission2.exp3 import tier_instance
from genesis.mission2.exp4 import min_certificate
from genesis.mission6.dsl import Protocol, ancestor_protocol, propose
from genesis.mission6.executor import ExecResult, run_protocol
from genesis.mission6.lineage import (
    CandidateRecord,
    EvalStats,
    GenerationRecord,
    Lineage,
)

# ---------------------------------------------------- frozen (pre-registered)

TRAIN_SEEDS6 = list(range(2001, 2021))
VALID_SEEDS6 = list(range(2101, 2121))
TEST_SEEDS6 = list(range(3001, 3041))
TRAIN_SLACKS6 = (1.0, 1.25, 1.5)
UNSEEN_SLACKS6 = (0.9, 2.0)
GENERATIONS = 20

LAMBDA_COMM = 0.02
LAMBDA_FAIL = 0.20
LAMBDA_COMPLEXITY = 0.005

VOTE_SAMPLE = 3          # K: validation pairs sampled per voter

Pair = tuple[Instance, int, float]   # (instance, budget, slack)


def build_pairs(
    seeds: list[int],
    slacks: tuple[float, ...],
    config: Mission2Config,
    cycle: bool = False,
) -> list[Pair]:
    """cycle=True pairs each seed with one slack (training economy, as in
    experiment 5); cycle=False takes the full grid (evaluation)."""
    pairs: list[Pair] = []
    for i, seed in enumerate(seeds):
        instance = tier_instance(seed, config, "medium")
        cert, _ = min_certificate(instance, config)
        use = (slacks[i % len(slacks)],) if cycle else slacks
        for slack in use:
            pairs.append((instance, max(1, round(slack * cert)), slack))
    return pairs


def protocol_score(
    mean_accuracy: float,
    comm_ratio: float,
    unsolved_rate: float,
    complexity: float,
) -> float:
    return (
        mean_accuracy
        - LAMBDA_COMM * comm_ratio
        - LAMBDA_FAIL * unsolved_rate
        - LAMBDA_COMPLEXITY * complexity
    )


def evaluate_results(
    pairs: list[Pair],
    config: Mission2Config,
    protocol: Protocol | None = None,
    per_agent: list[Protocol] | None = None,
) -> list[ExecResult]:
    out = []
    for inst, budget, slack in pairs:
        r = run_protocol(inst, config, budget, protocol=protocol,
                         per_agent=per_agent)
        out.append(r.model_copy(update={"slack": slack}))
    return out


def evaluate(
    pairs: list[Pair],
    config: Mission2Config,
    protocol: Protocol | None = None,
    per_agent: list[Protocol] | None = None,
    results: list[ExecResult] | None = None,
) -> EvalStats:
    if results is None:
        results = evaluate_results(pairs, config, protocol=protocol,
                                   per_agent=per_agent)
    if per_agent is not None:
        complexity = statistics.fmean(p.complexity() for p in per_agent)
    else:
        complexity = float(protocol.complexity())
    mean_acc = statistics.fmean(r.expected_accuracy for r in results)
    comm = statistics.fmean(r.shares_used / r.share_budget for r in results)
    unsolved = statistics.fmean(0.0 if r.solved else 1.0 for r in results)
    fires: dict[str, int] = {}
    for r in results:
        for rid, n in r.rule_fires.items():
            fires[rid] = fires.get(rid, 0) + n
    return EvalStats(
        mean_accuracy=mean_acc,
        unsolved_rate=unsolved,
        comm_ratio=comm,
        complexity=complexity,
        score=protocol_score(mean_acc, comm, unsolved, complexity),
        weak_share_rate=statistics.fmean(r.weak_share_rate for r in results),
        pass_rate=statistics.fmean(r.pass_rate for r in results),
        forced_share_rate=statistics.fmean(
            1.0 if r.forced_shares else 0.0 for r in results
        ),
        fidelity=statistics.fmean(r.fidelity for r in results),
        rule_fires=fires,
    )


# ------------------------------------------------------------------ proposers


class ProposalContext(BaseModel):
    """Everything a proposer may see. Mission 7's leakage rules apply to
    how this is rendered into prompts, not to what exists here."""

    group: str
    master_seed: int
    gen: int
    incumbent: Protocol
    train_stats: EvalStats
    train_results: list[ExecResult]
    prev_rolled_back: bool | None = None   # closed-loop feedback


# proposer(context, seq) -> (candidate protocol, op label)
Proposer = Callable[[ProposalContext, int], tuple[Protocol, str]]


def random_proposer(context: ProposalContext, seq: int) -> tuple[Protocol, str]:
    """The mission-6 proposer, byte-identical rng keys."""
    author = ("designer" if context.group == "L" else f"agent{seq}")
    rng = random.Random(
        f"m6:{context.group}:{context.master_seed}:gen{context.gen}:prop{seq}"
    )
    return propose(context.incumbent, rng, author, context.gen, seq)


# ------------------------------------------------------------------ evolution


def evolve(
    group: str,
    config: Mission2Config,
    generations: int = GENERATIONS,
    train_seeds: list[int] | None = None,
    valid_seeds: list[int] | None = None,
    master_seed: int = 0,
    verbose: bool = False,
    founding: Protocol | None = None,
    proposer: Proposer | None = None,
) -> Lineage:
    """`founding` overrides the ancestor (ablation 5 and mission 7's
    escape runs). `proposer` overrides the random proposer (mission 7);
    J ignores it (per-agent proposals stay random)."""
    if group not in ("J", "K", "L", "M"):
        raise ValueError(f"unknown group {group}")
    train_pairs = build_pairs(
        train_seeds or TRAIN_SEEDS6, TRAIN_SLACKS6, config, cycle=True
    )
    valid_pairs = build_pairs(
        valid_seeds or VALID_SEEDS6, TRAIN_SLACKS6, config, cycle=False
    )
    lineage = Lineage(group=group, master_seed=master_seed)

    if group == "J":
        _evolve_j(lineage, config, generations, train_pairs, valid_pairs,
                  master_seed, verbose)
    else:
        _evolve_shared(lineage, group, config, generations, train_pairs,
                       valid_pairs, master_seed, verbose, founding=founding,
                       proposer=proposer)
    return lineage


def _log(verbose: bool, msg: str) -> None:
    if verbose:
        print(msg, flush=True)


def _evolve_shared(
    lineage: Lineage,
    group: str,
    config: Mission2Config,
    generations: int,
    train_pairs: list[Pair],
    valid_pairs: list[Pair],
    master_seed: int,
    verbose: bool,
    founding: Protocol | None = None,
    proposer: Proposer | None = None,
) -> None:
    if proposer is None:
        proposer = random_proposer
    incumbent = (founding.model_copy(deep=True) if founding is not None
                 else ancestor_protocol())
    lineage.record_incumbent(incumbent)
    incumbent_stats = evaluate(valid_pairs, config, protocol=incumbent)
    next_version = 1
    prev_rolled_back: bool | None = None

    for gen in range(1, generations + 1):
        train_results = evaluate_results(train_pairs, config,
                                         protocol=incumbent)
        train_stats = evaluate(train_pairs, config, protocol=incumbent,
                               results=train_results)

        # --- proposals -------------------------------------------------
        context = ProposalContext(
            group=group, master_seed=master_seed, gen=gen,
            incumbent=incumbent, train_stats=train_stats,
            train_results=train_results, prev_rolled_back=prev_rolled_back,
        )
        candidates: list[CandidateRecord] = []
        for seq in range(config.n_agents):
            author = "designer" if group == "L" else f"agent{seq}"
            cand, op = proposer(context, seq)
            candidates.append(
                CandidateRecord(proposer=author, op=op, protocol=cand)
            )

        # --- evaluation + adoption -------------------------------------
        if group in ("M", "L"):
            for c in candidates:
                c.stats = evaluate(valid_pairs, config, protocol=c.protocol)
            best = max(candidates, key=lambda c: c.stats.score)
            if best.stats.score > incumbent_stats.score:
                best.adopted = True
                adopted = best.protocol.model_copy(deep=True)
                adopted.version = next_version
                adopted.parent_version = incumbent.version
                adopted.adopted_gen = gen
                next_version += 1
                rolled_back = False
                new_incumbent, new_stats = adopted, best.stats
            else:
                rolled_back = True
                new_incumbent, new_stats = incumbent, incumbent_stats
        else:  # K — plurality vote on private small samples, no rollback
            options: list[tuple[str, Protocol]] = [
                ("incumbent", incumbent)
            ] + [(c.proposer, c.protocol) for c in candidates]
            votes = [0] * len(options)
            for voter in range(config.n_agents):
                vrng = random.Random(
                    f"m6:K:{master_seed}:gen{gen}:vote{voter}"
                )
                sample = [
                    valid_pairs[i]
                    for i in sorted(vrng.sample(
                        range(len(valid_pairs)),
                        min(VOTE_SAMPLE, len(valid_pairs)),
                    ))
                ]
                scores = [
                    evaluate(sample, config, protocol=p).score
                    for _, p in options
                ]
                votes[max(range(len(options)),
                          key=lambda i: (scores[i], -i))] += 1
            # plurality; ties resolve toward the incumbent (index 0)
            winner = max(range(len(options)),
                         key=lambda i: (votes[i], -i))
            for i, c in enumerate(candidates):
                c.votes = votes[i + 1]
                # telemetry: record the blind score the vote never saw
                c.stats = evaluate(valid_pairs, config, protocol=c.protocol)
            if winner == 0:
                rolled_back = True   # for K this means "incumbent re-elected"
                new_incumbent, new_stats = incumbent, incumbent_stats
            else:
                chosen = candidates[winner - 1]
                chosen.adopted = True
                adopted = chosen.protocol.model_copy(deep=True)
                adopted.version = next_version
                adopted.parent_version = incumbent.version
                adopted.adopted_gen = gen
                next_version += 1
                rolled_back = False
                new_incumbent, new_stats = adopted, chosen.stats

        lineage.generations.append(GenerationRecord(
            gen=gen,
            incumbent_version_before=incumbent.version,
            incumbent_version_after=new_incumbent.version,
            incumbent_score=new_stats.score,
            rolled_back=rolled_back,
            train=train_stats,
            candidates=candidates,
        ))
        incumbent, incumbent_stats = new_incumbent, new_stats
        prev_rolled_back = rolled_back
        lineage.record_incumbent(incumbent)
        _log(verbose,
             f"[{group}] gen {gen}: v{incumbent.version} "
             f"score={incumbent_stats.score:.4f} "
             f"acc={incumbent_stats.mean_accuracy:.3f} "
             f"rules={len(incumbent.rules)} "
             f"{'(rollback)' if rolled_back else ''}")


def _evolve_j(
    lineage: Lineage,
    config: Mission2Config,
    generations: int,
    train_pairs: list[Pair],
    valid_pairs: list[Pair],
    master_seed: int,
    verbose: bool,
) -> None:
    """Individual policies only: agent i may mutate slot i. Each candidate
    is scored as a swap-in against the current society; improvements are
    adopted slot-wise, simultaneously (no collective rule exists)."""
    society = [ancestor_protocol() for _ in range(config.n_agents)]
    incumbent_stats = evaluate(valid_pairs, config, per_agent=society)
    versions = [0] * config.n_agents
    next_version = 1

    for gen in range(1, generations + 1):
        train_stats = evaluate(train_pairs, config, per_agent=society)
        candidates: list[CandidateRecord] = []
        adopters: list[tuple[int, Protocol, EvalStats]] = []
        for ai in range(config.n_agents):
            rng = random.Random(f"m6:J:{master_seed}:gen{gen}:prop{ai}")
            cand, op = propose(society[ai], rng, f"agent{ai}", gen, ai)
            trial = list(society)
            trial[ai] = cand
            stats = evaluate(valid_pairs, config, per_agent=trial)
            rec = CandidateRecord(
                proposer=f"agent{ai}", op=op, slot=ai,
                protocol=cand, stats=stats,
            )
            if stats.score > incumbent_stats.score:
                rec.adopted = True
                adopters.append((ai, cand, stats))
            candidates.append(rec)

        for ai, cand, _ in adopters:
            adopted = cand.model_copy(deep=True)
            adopted.version = next_version
            adopted.parent_version = versions[ai]
            adopted.adopted_gen = gen
            next_version += 1
            society[ai] = adopted
            versions[ai] = adopted.version
        new_stats = (
            evaluate(valid_pairs, config, per_agent=society)
            if adopters else incumbent_stats
        )

        # J has no single incumbent; the generation index stands in as the
        # society version so the audit chain stays meaningful.
        lineage.generations.append(GenerationRecord(
            gen=gen,
            incumbent_version_before=gen - 1,
            incumbent_version_after=gen,
            incumbent_score=new_stats.score,
            rolled_back=not adopters,
            train=train_stats,
            candidates=candidates,
        ))
        lineage.protocols[str(gen)] = Protocol(
            version=gen, parent_version=gen - 1, adopted_gen=gen, rules=[]
        )
        incumbent_stats = new_stats
        _log(verbose,
             f"[J] gen {gen}: score={incumbent_stats.score:.4f} "
             f"acc={incumbent_stats.mean_accuracy:.3f} "
             f"adopted={len(adopters)}/{config.n_agents}")

    lineage.final_per_agent = [p.model_copy(deep=True) for p in society]
