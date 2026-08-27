import { brierOf } from "./metrics.ts";
import { simulate } from "./simulate.ts";
import { BENCHMARK, assertBenchmarkIntact } from "./worldgen.ts";
import type { Agent } from "./agents.ts";

/**
 * 고정 벤치마크 측정.
 *
 * 진화 루프 바깥에 있는 유일한 자. 커리큘럼도, 유전자 진화도 이
 * 결과를 보고 무언가를 고르지 않는다 — 자가 훈련 신호가 되는 순간
 * 자이기를 그만둔다.
 */

export type BenchRow = {
  name: string;
  approval: number;
  brier: number;
  ceiling: number;
};

export type BenchResult = {
  rows: BenchRow[];
  /**
   * 초반 구간의 천장까지 남은 거리.
   *
   * **전이는 여기서 보인다.** 이전에 배운 것이 있으면 처음부터 잘하고,
   * 없으면 바닥에서 시작한다. 후반부를 재면 둘 다 수렴해 버려서
   * 차이가 사라진다 — 실제로 그 실수를 한 번 했다.
   */
  earlyGap: number;
  /** 후반 구간. 이건 전이가 아니라 **도달 가능한 한계**를 본다. */
  meanGap: number;
  meanBrier: number;
};

export type Suite = readonly { name: string; spec: import("./world.ts").WorldSpec; seed: number }[];

export function evaluateOnBenchmark(
  agent: Agent,
  episodes: number,
  suite: Suite = BENCHMARK,
): BenchResult {
  assertBenchmarkIntact();
  const rows: BenchRow[] = [];

  const earlyGaps: number[] = [];

  for (const { name, spec, seed } of suite) {
    const { experiences } = simulate(() => agent, { episodes, seed, spec });
    const ceiling = 1 - spec.noise;

    const early = experiences.slice(0, Math.max(40, Math.floor(episodes / 8)));
    const earlyApproval =
      early.filter((e) => e.outcome.verdict === "approved").length / early.length;
    earlyGaps.push(ceiling - earlyApproval);

    const tail = experiences.slice(-Math.floor(episodes / 2));
    const approval =
      tail.filter((e) => e.outcome.verdict === "approved").length / tail.length;
    rows.push({ name, approval, brier: brierOf(tail), ceiling });
  }

  return {
    rows,
    earlyGap: earlyGaps.reduce((s, g) => s + g, 0) / earlyGaps.length,
    meanGap: rows.reduce((s, r) => s + (r.ceiling - r.approval), 0) / rows.length,
    meanBrier: rows.reduce((s, r) => s + r.brier, 0) / rows.length,
  };
}
