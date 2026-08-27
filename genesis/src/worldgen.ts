import { describeLaw } from "./laws.ts";
import { makeRng, pick } from "./rng.ts";
import { ALL_APPROACHES } from "./agents.ts";
import { holds, satisfied } from "./laws.ts";
import { APPROACH_AXES } from "./types.ts";
import type { Condition, Feature, Law } from "./laws.ts";
import type { Approach, Situation } from "./types.ts";
import type { WorldSpec } from "./world.ts";

/**
 * 세계 생성기.
 *
 * 법칙을 문법의 표현식으로 조합해 세계를 만든다. 우리가 손으로 쓴 적
 * 없는 법칙이 여기서 나온다 — 그게 이 파일의 존재 이유다.
 */

export type WorldGenome = {
  /** 숨은 법칙 수. 많을수록 어렵다. */
  lawCount: number;
  /** 2조건(상호작용) 법칙의 비율. 단일 맥락 기억으로는 못 배우는 종류. */
  interactionRatio: number;
  /** 환경 잡음. 배워도 줄지 않는 오차의 바닥. */
  noise: number;
  /** 기준이 뒤집히는 시점. 0이면 고정. */
  regimeAt: number;
};

const FEATURE_VALUES: Record<Feature, readonly string[]> = {
  kind: ["research", "outreach", "summary"],
  audience: ["executive", "team", "client"],
  urgency: ["low", "high"],
};

const FEATURES: Feature[] = ["kind", "audience", "urgency"];
const AXES = Object.keys(APPROACH_AXES) as (keyof Approach)[];

/** 이 세계의 모든 상황. 18가지뿐이라 전수 검사가 가능하다. */
function allSituations(): Situation[] {
  const out: Situation[] = [];
  for (const kind of FEATURE_VALUES.kind)
    for (const audience of FEATURE_VALUES.audience)
      for (const urgency of FEATURE_VALUES.urgency)
        out.push({ kind, audience, urgency } as Situation);
  return out;
}

/**
 * 풀 수 있는 세계인가.
 *
 * 법칙을 무작위로 조합하면 서로 충돌할 수 있다 — 같은 상황에서 한
 * 법칙은 short 를, 다른 법칙은 long 을 요구하면 그 상황은 무슨 짓을
 * 해도 통과할 수 없다.
 *
 * 그런 세계를 버리는 이유는 어려워서가 아니라 **측정이 망가져서**다.
 * 도달 불가능한 천장을 기준으로 성적을 재면 에이전트가 잘하고 있는지
 * 알 수 없다. 모든 상황에 답이 하나는 있어야 한다.
 */
export function isSolvable(laws: Law[]): boolean {
  for (const s of allSituations()) {
    const applicable = laws.filter((l) => holds(l.when, s));
    const ok = ALL_APPROACHES.some((a) =>
      applicable.every((l) => satisfied(l.require, a)),
    );
    if (!ok) return false;
  }
  return true;
}

function makeCondition(rng: () => number, depth: number): Condition {
  const feature = pick(rng, FEATURES);
  const eq: Condition = {
    kind: "eq",
    feature,
    value: pick(rng, FEATURE_VALUES[feature]),
  };
  if (depth <= 1) return eq;

  // 두 번째 조건은 다른 특징에서 고른다. 같은 특징을 두 번 걸면
  // (kind=research & kind=summary) 처럼 절대 성립하지 않는 조건이 된다.
  const others = FEATURES.filter((f) => f !== feature);
  const second = pick(rng, others);
  return {
    kind: "and",
    left: eq,
    right: { kind: "eq", feature: second, value: pick(rng, FEATURE_VALUES[second]) },
  };
}

function makeLaws(genome: WorldGenome, seed: number): Law[] {
  const rng = makeRng(seed);
  const laws: Law[] = [];
  const usedAxes = new Set<string>();

  for (let i = 0; i < genome.lawCount; i++) {
    const depth = rng() < genome.interactionRatio ? 2 : 1;
    const axis = pick(rng, AXES);
    const value = pick(rng, APPROACH_AXES[axis] as readonly string[]);
    laws.push({
      name: `law_${i}_${axis}`,
      when: makeCondition(rng, depth),
      require: { axis, value },
      penalty: rng() < 0.25 ? "rejected" : "revision",
    });
    usedAxes.add(axis);
  }
  return laws;
}

/**
 * 유전자에서 세계를 만든다. 풀 수 없는 조합이 나오면 시드를 밀어
 * 다시 시도한다 — 어려운 세계는 좋지만 불가능한 세계는 자가 망가진다.
 */
export function generateWorld(genome: WorldGenome, seed: number): WorldSpec {
  for (let attempt = 0; attempt < 200; attempt++) {
    const laws = makeLaws(genome, seed + attempt * 7919);
    if (isSolvable(laws)) {
      return {
        laws,
        noise: genome.noise,
        regimeAt: genome.regimeAt,
        flipTarget: laws[0]?.name,
      };
    }
  }
  // 유전자가 지나치게 빡빡하다. 법칙을 줄여 다시.
  return generateWorld({ ...genome, lawCount: Math.max(1, genome.lawCount - 1) }, seed);
}

export function describeSpec(spec: WorldSpec): string[] {
  return spec.laws.map(describeLaw);
}

/**
 * ── 고정 벤치마크 ──────────────────────────────────────────────────
 *
 * 절대 진화하지 않는다. 헌법을 유전자와 다른 파일에 둔 것과 같은
 * 이유다.
 *
 * 세계와 에이전트가 둘 다 움직이면 "나아졌다"를 잴 기준이 사라진다.
 * 성적이 올라도 세계가 쉬워진 건지 에이전트가 는 건지 알 수 없다.
 * 그래서 진화 루프 밖에 자를 하나 박아 둔다.
 *
 * 여섯 세계는 일부러 성격을 다르게 잡았다 — 쉬운 것, 상호작용이
 * 많은 것, 잡음이 큰 것, 기준이 바뀌는 것.
 */
const BENCHMARK_GENOMES: { name: string; genome: WorldGenome; seed: number }[] = [
  { name: "평이", genome: { lawCount: 3, interactionRatio: 0, noise: 0.05, regimeAt: 0 }, seed: 1001 },
  { name: "표준", genome: { lawCount: 5, interactionRatio: 0.2, noise: 0.08, regimeAt: 0 }, seed: 1002 },
  { name: "상호작용", genome: { lawCount: 5, interactionRatio: 0.8, noise: 0.08, regimeAt: 0 }, seed: 1003 },
  { name: "잡음", genome: { lawCount: 4, interactionRatio: 0.2, noise: 0.18, regimeAt: 0 }, seed: 1004 },
  { name: "기준변경", genome: { lawCount: 5, interactionRatio: 0.2, noise: 0.08, regimeAt: 300 }, seed: 1005 },
  { name: "복잡", genome: { lawCount: 7, interactionRatio: 0.5, noise: 0.08, regimeAt: 0 }, seed: 1006 },
];

export const BENCHMARK: readonly { name: string; spec: WorldSpec; seed: number }[] =
  Object.freeze(
    BENCHMARK_GENOMES.map(({ name, genome, seed }) =>
      Object.freeze({ name, spec: generateWorld(genome, seed), seed }),
    ),
  );

/** 벤치마크가 손대지 않은 상태인지. 진화 루프가 부르는 안전장치. */
export function assertBenchmarkIntact(): void {
  if (!Object.isFrozen(BENCHMARK)) {
    throw new Error("벤치마크가 동결 해제되었다. 측정 기준을 신뢰할 수 없다.");
  }
  if (BENCHMARK.length !== BENCHMARK_GENOMES.length) {
    throw new Error("벤치마크 세계 수가 바뀌었다.");
  }
}
