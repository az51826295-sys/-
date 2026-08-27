import { GenesisAgent } from "./src/agents.ts";
import { evaluateOnBenchmark } from "./src/benchmark.ts";
import { PATTERN_SUITE, SHARED_SUITE, TRAIN_WORLD } from "./src/families.ts";
import { BASE_GENOME } from "./src/genome.ts";
import { simulate } from "./src/simulate.ts";
import { BENCHMARK } from "./src/worldgen.ts";
import type { Suite } from "./src/benchmark.ts";

/**
 * 전이 진단.
 *
 * 자를 셋으로 나눠 각각 다른 것을 묻는다. 하나의 숫자로는 "전이가
 * 되는가"에 답할 수 없다는 것이 지난 측정의 교훈이었다.
 *
 *   무관 — 법칙이 전부 다르다. 옮겨갈 것이 없다.  → 전이 없어야 정상
 *   공유 — 핵심 법칙 3개가 그대로 있다.          → 전이 되어야 정상
 *   패턴 — 모양만 같고 표면값이 다르다.           → 지금 구조는 실패할 것
 *
 * 세 결과의 **모양**이 진단이다. 공유에서만 오르면 에이전트는 정상이고
 * 자가 문제였던 것이고, 공유에서도 안 오르면 에이전트가 문제다.
 */

const TRAIN = Number(process.env.TRAIN ?? 3000);
const BENCH = Number(process.env.BENCH ?? 800);

const GENOME = { ...BASE_GENOME, decay: 0.98, budgetFraction: 0.1 };
const pct = (x: number) => (x * 100).toFixed(1).padStart(5) + "%";

console.log(`\n전이 진단 — 훈련 ${TRAIN}, 각 세계 ${BENCH} 에피소드`);
console.log(`유전자는 두 에이전트가 동일합니다. 다른 것은 이전 경험 유무뿐입니다.\n`);

/** 관계층을 켠 유전자. 값은 버리되 관계는 남긴다. */
const RELATIONAL = { ...GENOME, forgetOnSurprise: true, relationalWeight: 3.0 };

/** 훈련 세계에도 핵심 법칙이 들어 있다. 옮겨갈 것이 실제로 존재한다. */
function trainedAgent(genome = GENOME): GenesisAgent {
  const agent = new GenesisAgent(TRAIN + BENCH * 20, genome);
  simulate(() => agent, { episodes: TRAIN, seed: 9001, spec: TRAIN_WORLD });
  return agent;
}

function freshAgent(): GenesisAgent {
  return new GenesisAgent(BENCH * 20, GENOME);
}

const suites: { label: string; suite: Suite; expect: string }[] = [
  { label: "무관", suite: BENCHMARK, expect: "전이 없음이 정상" },
  { label: "공유", suite: SHARED_SUITE, expect: "전이 되어야 정상" },
  { label: "패턴", suite: PATTERN_SUITE, expect: "지금 구조는 실패 예상" },
];

console.log("── 초반 구간 (첫 100 에피소드, 천장까지 남은 거리) ──");
console.log("   자      신규    관계층OFF   관계층ON    OFF차이   ON차이");

const results: { label: string; delta: number; deltaRel: number }[] = [];

for (const { label, suite } of suites) {
  // 에이전트를 매번 새로 만든다. 앞선 자에서의 경험이 다음 자로
  // 새어 들어가면 무엇을 재는지 알 수 없다.
  const fresh = evaluateOnBenchmark(freshAgent(), BENCH, suite);
  const off = evaluateOnBenchmark(trainedAgent(GENOME), BENCH, suite);
  const on = evaluateOnBenchmark(trainedAgent(RELATIONAL), BENCH, suite);

  const delta = fresh.earlyGap - off.earlyGap; // 양수 = 훈련이 도움
  const deltaRel = fresh.earlyGap - on.earlyGap;
  results.push({ label, delta, deltaRel });

  const fmt = (d: number) => ((d >= 0 ? "+" : "") + (d * 100).toFixed(1) + "%p").padStart(7);
  console.log(
    `   ${label.padEnd(6)} ${pct(fresh.earlyGap)}    ${pct(off.earlyGap)}    ${pct(on.earlyGap)}` +
      `   ${fmt(delta)}  ${fmt(deltaRel)}`,
  );
}

const [unrelated, shared, pattern] = results as [
  { delta: number; deltaRel: number },
  { delta: number; deltaRel: number },
  { delta: number; deltaRel: number },
];

console.log("\n── 진단 ─────────────────────────────────────────────");

if (shared.deltaRel > 0.02) {
  console.log("   ✓ 공유 자에서 전이가 성립합니다.");
  console.log("     배운 것이 실제로 통하는 곳에서는 통합니다 —");
  console.log("     이전 측정의 음수는 에이전트가 아니라 자의 문제였습니다.");
} else {
  console.log("   ✗ 공유 자에서도 전이가 없습니다.");
  console.log("     법칙이 그대로 남아 있는데도 못 씁니다. 에이전트 문제입니다.");
}

console.log(
  pattern.deltaRel > pattern.delta + 0.02
    ? "\n   ✓ 패턴 자에서도 전이가 됩니다. 예상 밖입니다 — 확인이 필요합니다."
    : "\n   ✗ 패턴 자에서는 전이가 없습니다. 예상대로입니다.\n" +
        "     기억이 표면값에 붙어 있어서, 모양이 같아도 값이 다르면\n" +
        "     옮겨가지 못합니다. 다음에 고칠 곳이 여기입니다.",
);

console.log(
  `\n   무관 자 ${(unrelated.delta * 100).toFixed(1)}%p — 옮겨갈 구조가 없으니 이 값은 0 근처거나 음수가 정상입니다.\n`,
);
