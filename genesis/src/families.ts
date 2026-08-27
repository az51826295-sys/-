import { makeRng, pick } from "./rng.ts";
import { generateWorld, isSolvable } from "./worldgen.ts";
import type { Feature, Law } from "./laws.ts";
import type { Approach } from "./types.ts";
import type { WorldGenome } from "./worldgen.ts";
import type { WorldSpec } from "./world.ts";

/**
 * 법칙 가족 — 전이를 실제로 잴 수 있는 자.
 *
 * 앞선 벤치마크는 세계마다 법칙을 완전히 새로 뽑았다. 그러면 세계들이
 * 공유하는 것은 특징 어휘뿐이고, A세계에서 배운 `audience=executive ::
 * length=long 은 나쁘다`가 B세계에 대해 말해주는 것이 **아무것도 없다.**
 * 옮겨갈 구조가 애초에 존재하지 않는 자로 "전이가 되는가"를 물은 것이
 * 이전 측정의 오류였다.
 *
 * 그래서 자를 셋으로 나눈다. 각각 다른 것을 묻는다.
 *
 *   무관   — 법칙이 전부 다르다. 옮겨갈 것이 없다.
 *            → 전이가 없어야 정상. 대조군.
 *   공유   — 핵심 법칙 3개가 그대로 있고 나머지만 다르다.
 *            → 배운 것이 그대로 통해야 한다. 안 되면 에이전트 문제.
 *   패턴   — 법칙의 **모양**은 같고 표면값만 다르다.
 *            ("어떤 독자값 하나가 분량을 제한한다" — 어떤 값인지는 세계마다)
 *            → 지금 기억은 값에 붙어 있어서 실패할 것이다.
 *              그 실패가 다음에 무엇을 고쳐야 하는지 알려준다.
 */

/** 세 자 모두가 공유하는 핵심 법칙. 값까지 고정. */
export const CORE_LAWS: Law[] = [
  {
    name: "core_executive_short",
    when: { kind: "eq", feature: "audience", value: "executive" },
    require: { axis: "length", value: "short" },
    penalty: "revision",
  },
  {
    name: "core_research_cites",
    when: { kind: "eq", feature: "kind", value: "research" },
    require: { axis: "cites", value: "yes" },
    penalty: "revision",
  },
  {
    name: "core_low_urgency_deep",
    when: { kind: "eq", feature: "urgency", value: "low" },
    require: { axis: "depth", value: "deep" },
    penalty: "revision",
  },
];

/**
 * 법칙의 모양. 값은 비어 있다.
 *
 * "어떤 독자값이 분량을 제한한다"까지가 패턴이고, 그게 executive 인지
 * client 인지는 세계마다 다르다. 값이 아니라 관계를 배운 에이전트만
 * 이걸 옮겨갈 수 있다.
 */
export type LawPattern = {
  name: string;
  feature: Feature;
  axis: keyof Approach;
  requiredValue: string;
  penalty: "revision" | "rejected";
};

export const CORE_PATTERNS: LawPattern[] = [
  { name: "pat_audience_length", feature: "audience", axis: "length", requiredValue: "short", penalty: "revision" },
  { name: "pat_kind_cites", feature: "kind", axis: "cites", requiredValue: "yes", penalty: "revision" },
  { name: "pat_urgency_depth", feature: "urgency", axis: "depth", requiredValue: "deep", penalty: "revision" },
];

const FEATURE_VALUES: Record<Feature, readonly string[]> = {
  kind: ["research", "outreach", "summary"],
  audience: ["executive", "team", "client"],
  urgency: ["low", "high"],
};

const AXIS_VALUES: Record<keyof Approach, readonly string[]> = {
  depth: ["shallow", "deep"],
  length: ["short", "long"],
  cites: ["yes", "no"],
  tone: ["formal", "casual"],
};

/**
 * 패턴에 표면값을 넣어 실제 법칙으로 만든다.
 *
 * 조건값과 **요구값을 둘 다** 세계마다 새로 뽑는 것이 중요하다.
 * 첫 설계는 요구값을 short/yes/deep 로 고정했는데, 그러면 모든 패턴
 * 세계에서 같은 접근이 안전해진다 — 에이전트는 관계를 배운 게 아니라
 * "짧게 쓰면 대체로 통과한다"를 배워서 옮겨간다. 패턴 전이를 재려던
 * 자가 안전 접근 전이를 재고 있었다.
 */
function instantiate(p: LawPattern, rng: () => number): Law {
  return {
    name: `${p.name}__${p.feature}`,
    when: { kind: "eq", feature: p.feature, value: pick(rng, FEATURE_VALUES[p.feature]) },
    require: { axis: p.axis, value: pick(rng, AXIS_VALUES[p.axis]) },
    penalty: p.penalty,
  };
}

/**
 * 핵심 법칙을 그대로 넣고 나머지는 생성한다.
 *
 * 배운 것이 **그대로** 통해야 하는 세계. 여기서도 전이가 안 되면
 * 그건 자의 문제가 아니라 에이전트의 문제다.
 */
export function generateSharedWorld(genome: WorldGenome, seed: number): WorldSpec {
  for (let attempt = 0; attempt < 200; attempt++) {
    const extra = generateWorld(
      { ...genome, lawCount: Math.max(1, genome.lawCount - CORE_LAWS.length) },
      seed + attempt * 104729,
    );
    const laws = [...CORE_LAWS, ...extra.laws];
    if (isSolvable(laws)) {
      return { laws, noise: genome.noise, regimeAt: genome.regimeAt, flipTarget: extra.laws[0]?.name };
    }
  }
  return { laws: CORE_LAWS, noise: genome.noise, regimeAt: genome.regimeAt };
}

/**
 * 패턴만 공유하고 표면값은 세계마다 다르게.
 *
 * 값에 붙은 기억은 여기서 **적극적으로 틀린다** — A세계에서 executive가
 * 짧은 걸 원했다는 사실이 B세계에서는 client에 대한 이야기가 되어야
 * 하는데, 지금 구조는 그 변환을 할 수 없다.
 */
export function generatePatternWorld(genome: WorldGenome, seed: number): WorldSpec {
  const rng = makeRng(seed);
  for (let attempt = 0; attempt < 200; attempt++) {
    const laws = CORE_PATTERNS.map((p) => instantiate(p, rng));
    if (isSolvable(laws)) {
      return { laws, noise: genome.noise, regimeAt: genome.regimeAt, flipTarget: laws[0]?.name };
    }
  }
  return { laws: [instantiate(CORE_PATTERNS[0] as LawPattern, rng)], noise: genome.noise, regimeAt: 0 };
}

const SUITE_GENOME: WorldGenome = {
  lawCount: 5,
  interactionRatio: 0.2,
  noise: 0.08,
  regimeAt: 0,
};

export type Suite = readonly { name: string; spec: WorldSpec; seed: number }[];

/** 핵심 법칙이 그대로 있는 세계들. 전이가 되어야 정상. */
export const SHARED_SUITE: Suite = Object.freeze(
  [2001, 2002, 2003, 2004].map((seed, i) =>
    Object.freeze({ name: `공유${i + 1}`, spec: generateSharedWorld(SUITE_GENOME, seed), seed }),
  ),
);

/** 모양만 같고 값은 다른 세계들. 값에 붙은 기억은 여기서 실패한다. */
export const PATTERN_SUITE: Suite = Object.freeze(
  [3001, 3002, 3003, 3004].map((seed, i) =>
    Object.freeze({ name: `패턴${i + 1}`, spec: generatePatternWorld(SUITE_GENOME, seed), seed }),
  ),
);

/** 훈련용 세계. 핵심 법칙을 담고 있지만 벤치마크에는 없는 시드. */
export const TRAIN_WORLD: WorldSpec = generateSharedWorld(SUITE_GENOME, 9001);
