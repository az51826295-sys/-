import { GenesisAgent } from "./src/agents.ts";
import { evaluateOnBenchmark } from "./src/benchmark.ts";
import { PATTERN_SUITE, SHARED_SUITE, TRAIN_WORLD } from "./src/families.ts";
import { BASE_GENOME } from "./src/genome.ts";
import { simulate } from "./src/simulate.ts";
import { BENCHMARK } from "./src/worldgen.ts";
import type { Suite } from "./src/benchmark.ts";
import type { Genome } from "./src/genome.ts";

/**
 * 분해 실험 — 무관 자의 +10.0%p 는 어디서 왔는가.
 *
 * 관계층을 켤 때 두 가지가 동시에 켜졌다.
 *
 *   forgetOnSurprise — 놀라면 값의 확신을 낮춘다 (내용은 남김)
 *   relationalWeight — 어느 축을 실험할지 관계층이 고른다
 *
 * 둘을 함께 켜고 "효과가 있다"고 말하면, 무엇 덕분인지 모른 채로
 * 다음 단계로 간다. 그래서 2×2 로 가른다.
 *
 * 훈련 시드도 여럿 쓴다. 한 시드의 결과는 실력인지 운인지 구분되지
 * 않는다 — 이 프로젝트가 세계마다 지켜온 규칙을 실험 자체에도 적용한다.
 */

const TRAIN = Number(process.env.TRAIN ?? 3000);
const BENCH = Number(process.env.BENCH ?? 800);
const SEEDS = [9001, 9002, 9003];

const GENOME: Genome = { ...BASE_GENOME, decay: 0.98, budgetFraction: 0.1 };
const pct = (x: number) => (x * 100).toFixed(1).padStart(5) + "%";
const signed = (x: number) => ((x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%p").padStart(7);

const conditions: { label: string; genome: Genome }[] = [
  { label: "둘 다 꺼짐", genome: GENOME },
  { label: "확신완화만", genome: { ...GENOME, forgetOnSurprise: true } },
  { label: "관계층만", genome: { ...GENOME, relationalWeight: 3.0 } },
  { label: "둘 다 켜짐", genome: { ...GENOME, forgetOnSurprise: true, relationalWeight: 3.0 } },
];

const suites: { label: string; suite: Suite }[] = [
  { label: "무관", suite: BENCHMARK },
  { label: "공유", suite: SHARED_SUITE },
  { label: "패턴", suite: PATTERN_SUITE },
];

/** 여러 시드로 훈련해 평균 낸다. 한 번의 결과는 결과가 아니다. */
function meanEarlyGap(genome: Genome, suite: Suite): { mean: number; spread: number } {
  const gaps = SEEDS.map((seed) => {
    const agent = new GenesisAgent(TRAIN + BENCH * 20, genome);
    simulate(() => agent, { episodes: TRAIN, seed, spec: TRAIN_WORLD });
    return evaluateOnBenchmark(agent, BENCH, suite).earlyGap;
  });
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  return { mean, spread: Math.max(...gaps) - Math.min(...gaps) };
}

/** 신규 대조군도 같은 수의 시드로. */
function freshBaseline(suite: Suite): number {
  const gaps = SEEDS.map(() =>
    evaluateOnBenchmark(new GenesisAgent(BENCH * 20, GENOME), BENCH, suite).earlyGap,
  );
  return gaps.reduce((s, g) => s + g, 0) / gaps.length;
}

console.log(`\n분해 실험 — 훈련 ${TRAIN} × 시드 ${SEEDS.length}개, 각 세계 ${BENCH}`);
console.log(`숫자는 신규 대비 개선폭입니다. 양수 = 이전 학습이 도움.\n`);

for (const { label: suiteLabel, suite } of suites) {
  const fresh = freshBaseline(suite);
  console.log(`── ${suiteLabel} 자 (신규 ${pct(fresh)}) ${"─".repeat(28)}`);
  console.log(`   조건            초반갭     개선폭    시드편차`);

  for (const { label, genome } of conditions) {
    const { mean, spread } = meanEarlyGap(genome, suite);
    const delta = fresh - mean;
    // 시드 편차가 개선폭보다 크면 그 숫자는 아직 결론이 아니다.
    const shaky = spread > Math.abs(delta) ? "  ← 편차가 더 큼" : "";
    console.log(
      `   ${label.padEnd(14)} ${pct(mean)}   ${signed(delta)}    ${pct(spread)}${shaky}`,
    );
  }
  console.log();
}

console.log("── 읽는 법 ──────────────────────────────────────────");
console.log("   '확신완화만' 이 대부분을 설명하면 → 낡은 확신을 내려놓은 것이 값을 한 것");
console.log("   '관계층만' 이 대부분을 설명하면   → 세계의 구조에 대한 지식이 전이된 것");
console.log("   둘 다 필요하면                    → 두 장치가 서로를 보완하는 것");
console.log("   시드 편차가 개선폭보다 크면       → 아직 아무것도 말할 수 없음\n");
