import { writeFileSync, mkdirSync } from "node:fs";
import { GenesisAgent } from "./agents.ts";
import { CONSTITUTION, assertConstitutionIntact } from "./constitution.ts";
import { MUTATIONS, describe, mutate } from "./genome.ts";
import { brierOf } from "./metrics.ts";
import { simulate } from "./simulate.ts";
import type { GeneName, Genome } from "./genome.ts";
import type { Experience } from "./types.ts";

/**
 * 자기진화 엔진 (Phase 5).
 *
 * 여기서 지키는 것들이 전부 헌법에서 온다:
 *
 *  · 한 실험에 유전자 하나만 (ONE_GENE_PER_EXPERIMENT)
 *  · 후보는 복제본에서만 평가 (SANDBOX_ONLY_EVOLUTION)
 *      simulate() 가 매번 새 에이전트를 만들기 때문에 운영 중인
 *      개체는 존재하지 않는다. 구조적으로 오염이 불가능하다.
 *  · 여러 세계에서 검증 (MIN_EVALUATION_SEEDS)
 *      한 시드에서만 좋은 건 과적합이다.
 *  · 회귀 검사 (MAX_REGRESSION)
 *      목표 지표가 올라도 다른 능력이 떨어지면 탈락.
 *
 * 그리고 가장 중요한 것: **점수는 에이전트가 매기지 않는다.**
 * 평가는 원장에 남은 결과에서 계산된다. 자기가 잘했다고 적어 넣는
 * 필드는 어디에도 없다 (SELF_GRADING_FORBIDDEN).
 */

export type Evaluation = {
  /** 마지막 구간 승인률 — 주 지표 */
  approval: number;
  /** 마지막 구간 Brier — 회귀 검사 대상 */
  brier: number;
  /** 기준 변경 직후 구간의 승인률 — 적응력. 회귀 검사 대상 */
  recovery: number;
  /** 탐색에 쓴 에피소드 비율 — 비용 */
  explorationCost: number;
};

export type EvalOptions = {
  episodes: number;
  seeds: number[];
  regimeAt: number;
  window: number;
};

function tailOf(xs: Experience[], window: number): Experience[] {
  return xs.slice(-window);
}

function approvalOf(xs: Experience[]): number {
  return xs.filter((e) => e.outcome.verdict === "approved").length / xs.length;
}

/**
 * 독립 평가자.
 *
 * 후보 유전자를 여러 세계에 풀어놓고, 결과 로그에서만 점수를 낸다.
 * 에이전트에게 "너 어땠니"를 묻지 않는다.
 */
export function evaluate(genome: Genome, o: EvalOptions): Evaluation {
  if (o.seeds.length < CONSTITUTION.MIN_EVALUATION_SEEDS) {
    throw new Error(
      `평가 시드가 부족하다: ${o.seeds.length} < ${CONSTITUTION.MIN_EVALUATION_SEEDS}`,
    );
  }

  let approval = 0;
  let brier = 0;
  let recovery = 0;
  let explored = 0;

  for (const seed of o.seeds) {
    const run = simulate(() => new GenesisAgent(o.episodes, genome), {
      episodes: o.episodes,
      seed,
      regimeAt: o.regimeAt,
    });
    const tail = tailOf(run.experiences, o.window);
    approval += approvalOf(tail);
    brier += brierOf(tail);

    // 기준이 뒤집힌 직후 한 구간. 얼마나 빨리 털고 일어나는가.
    const after = run.experiences.slice(o.regimeAt, o.regimeAt + o.window);
    recovery += approvalOf(after);

    explored += run.explored.filter(Boolean).length / o.episodes;
  }

  const n = o.seeds.length;
  return {
    approval: approval / n,
    brier: brier / n,
    recovery: recovery / n,
    explorationCost: explored / n,
  };
}

export type Candidate = {
  gene: GeneName;
  value: unknown;
  genome: Genome;
  evaluation: Evaluation;
  /** 회귀 검사 결과. 하나라도 걸리면 점수와 무관하게 탈락. */
  rejected: string | null;
  delta: number;
};

/**
 * 회귀 검사.
 *
 * 주 지표가 올랐다는 이유로 채택하면, 개선할 때마다 다른 곳이
 * 조금씩 무너지는 걸 못 본다. 여러 세대가 지나면 원래 잘하던 것을
 * 전부 잃은 채로 한 가지만 잘하는 개체가 남는다.
 */
function checkRegression(base: Evaluation, cand: Evaluation): string | null {
  const max = CONSTITUTION.MAX_REGRESSION;
  if (cand.brier > base.brier + max) {
    return `Brier 악화 ${(cand.brier - base.brier).toFixed(4)}`;
  }
  if (cand.recovery < base.recovery - max) {
    return `적응력 악화 ${(base.recovery - cand.recovery).toFixed(4)}`;
  }
  return null;
}

/** 한 세대 — 유전자 하나씩만 바꾼 후보 전부를 평가한다. */
export function generation(
  base: Genome,
  baseEval: Evaluation,
  o: EvalOptions,
): Candidate[] {
  assertConstitutionIntact();
  const out: Candidate[] = [];

  for (const gene of Object.keys(MUTATIONS) as GeneName[]) {
    for (const value of MUTATIONS[gene]) {
      if (base[gene] === value) continue;
      const genome = mutate(base, gene, value);
      const evaluation = evaluate(genome, o);
      out.push({
        gene,
        value,
        genome,
        evaluation,
        rejected: checkRegression(baseEval, evaluation),
        delta: evaluation.approval - baseEval.approval,
      });
    }
  }
  return out.sort((a, b) => b.delta - a.delta);
}

/** 진화 계보 + Evolution Memory (Phase 5, 14·23절). */
export type LineageEntry = {
  generation: number;
  parent: string;
  gene: GeneName;
  value: unknown;
  delta: number;
  decision: "adopted" | "rejected";
  reason: string;
  evaluation: Evaluation;
};

export function writeLineage(entries: LineageEntry[], path: string): void {
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, JSON.stringify(entries, null, 2), "utf8");
}

export { describe };
