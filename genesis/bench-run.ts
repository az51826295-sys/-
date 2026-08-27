import { GenesisAgent } from "./src/agents.ts";
import { BASE_GENOME } from "./src/genome.ts";
import { brierOf } from "./src/metrics.ts";
import { simulate } from "./src/simulate.ts";
import { BENCHMARK, assertBenchmarkIntact, describeSpec } from "./src/worldgen.ts";
import type { Agent } from "./src/agents.ts";
import type { Experience } from "./src/types.ts";

/**
 * 고정 벤치마크.
 *
 * 세계를 진화시키기 전에 자부터 박는다. 세계와 에이전트가 둘 다
 * 움직이면 "나아졌다"를 잴 방법이 사라지기 때문이다.
 *
 * 여기서 재는 것은 승인률이 아니라 **처음 보는 세계에서의 적응**이다.
 * 벤치마크 세계는 에이전트가 한 번도 본 적 없고, 법칙도 다르다.
 * 이전에 배운 것이 도움이 되는지 방해가 되는지가 바로 드러난다.
 */

const TRAIN = Number(process.env.TRAIN ?? 3000);
const BENCH = Number(process.env.BENCH ?? 800);

const pct = (x: number) => (x * 100).toFixed(1).padStart(5) + "%";

assertBenchmarkIntact();

console.log(`\n고정 벤치마크 — 세계 ${BENCHMARK.length}개, 각 ${BENCH} 에피소드`);
console.log(`이 세계들은 진화하지 않습니다. 자가 움직이면 아무것도 잴 수 없습니다.\n`);

console.log("── 벤치마크 세계 ────────────────────────────────────");
for (const { name, spec } of BENCHMARK) {
  const laws = describeSpec(spec);
  console.log(
    `   ${name.padEnd(6)} 법칙 ${String(spec.laws.length).padStart(2)}개` +
      `  잡음 ${(spec.noise * 100).toFixed(0).padStart(2)}%` +
      `  천장 ${pct(1 - spec.noise)}` +
      (spec.regimeAt > 0 ? `  기준변경 @${spec.regimeAt}` : ""),
  );
  for (const l of laws.slice(0, 2)) console.log(`          ${l}`);
  if (laws.length > 2) console.log(`          … 외 ${laws.length - 2}개`);
}

/** 벤치마크 한 바퀴. 에이전트는 상태를 이어서 들고 간다. */
function benchmark(agent: Agent): {
  rows: { name: string; approval: number; brier: number; ceiling: number }[];
  meanGap: number;
  meanBrier: number;
} {
  const rows: { name: string; approval: number; brier: number; ceiling: number }[] = [];

  for (const { name, spec, seed } of BENCHMARK) {
    const { experiences } = simulate(() => agent, {
      episodes: BENCH,
      seed,
      spec,
    });
    const tail = experiences.slice(-Math.floor(BENCH / 2));
    const approval = tail.filter((e) => e.outcome.verdict === "approved").length / tail.length;
    rows.push({ name, approval, brier: brierOf(tail), ceiling: 1 - spec.noise });
  }

  // 천장이 세계마다 달라서 승인률을 그대로 평균 내면 안 된다.
  // 천장까지 얼마나 남았는지로 비교한다.
  const meanGap = rows.reduce((s, r) => s + (r.ceiling - r.approval), 0) / rows.length;
  const meanBrier = rows.reduce((s, r) => s + r.brier, 0) / rows.length;
  return { rows, meanGap, meanBrier };
}

// ── 대조군 ────────────────────────────────────────────────────────
//
// 아무것도 모르는 채로 벤치마크에 들어간다. 이게 바닥이다.
// 유전자를 맞춰야 한다. 신규는 기본 유전자, 훈련은 진화 유전자로
// 비교하면 "훈련이 도움이 됐다"가 아니라 "유전자가 좋았다"를 재게
// 된다 — 첫 측정에서 실제로 그 오류를 냈다.
const FRESH_GENOME = { ...BASE_GENOME, decay: 0.98, budgetFraction: 0.1 };
const freshAgent = new GenesisAgent(BENCH * BENCHMARK.length, FRESH_GENOME);
const fresh = benchmark(freshAgent);

// ── 기본 세계에서 훈련한 에이전트 ─────────────────────────────────
//
// 기존 다섯 법칙 세계에서 오래 배운 뒤 처음 보는 세계로 간다.
// 배운 것이 전이되는가, 아니면 낡은 확신이 발목을 잡는가.
const trainedAgent = new GenesisAgent(TRAIN + BENCH * BENCHMARK.length, BASE_GENOME);
simulate(() => trainedAgent, {
  episodes: TRAIN,
  seed: 42,
  regimeAt: Math.floor(TRAIN / 2),
});
const trained = benchmark(trainedAgent);

// ── 진화가 고른 유전자 ────────────────────────────────────────────
//
// 진화 엔진이 기준 변경이 있는 세계에서 스스로 찾아낸 값이다
// (decay 0.997 → 0.98, +16.55%p). 그게 **처음 보는 세계에서도**
// 통하는지가 진짜 질문이고, 그 답은 진화 루프 바깥의 자만 줄 수 있다.
const EVOLVED = { ...BASE_GENOME, decay: 0.98, budgetFraction: 0.1 };
const evolvedAgent = new GenesisAgent(TRAIN + BENCH * BENCHMARK.length, EVOLVED);
simulate(() => evolvedAgent, {
  episodes: TRAIN,
  seed: 42,
  regimeAt: Math.floor(TRAIN / 2),
});
const evolved = benchmark(evolvedAgent);

console.log("\n── 결과 (각 세계 후반부, 승인률) ────────────────────");
console.log("   세계      천장     신규    기본유전자   진화유전자");
for (let i = 0; i < BENCHMARK.length; i++) {
  const f = fresh.rows[i] as { name: string; approval: number; ceiling: number };
  const t = trained.rows[i] as { approval: number };
  const e = evolved.rows[i] as { approval: number };
  const mark = e.approval >= f.approval ? " ✓" : "";
  console.log(
    `   ${f.name.padEnd(8)} ${pct(f.ceiling)}  ${pct(f.approval)}    ${pct(t.approval)}` +
      `     ${pct(e.approval)}${mark}`,
  );
}

console.log("\n── 종합 (천장까지 남은 거리 — 작을수록 좋음) ────────");
for (const [label, r] of [
  ["신규 (아무것도 모름)", fresh],
  ["훈련 · 기본 유전자", trained],
  ["훈련 · 진화 유전자", evolved],
] as const) {
  console.log(
    `   ${label.padEnd(22)} ${pct(r.meanGap)}   Brier ${r.meanBrier.toFixed(4)}`,
  );
}

const best = evolved.meanGap < fresh.meanGap;
console.log(
  best
    ? `\n   → 진화가 고른 유전자는 처음 보는 세계에서도 통합니다.\n` +
        `     전이가 성립합니다 — 한 세계에서 얻은 것이 다른 세계에서 값을 합니다.\n`
    : `\n   → 아직 전이가 성립하지 않습니다. 낡은 확신이 발목을 잡습니다.\n`,
);

void ({} as Experience);
