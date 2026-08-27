import { GenesisAgent } from "./src/agents.ts";
import { evaluateOnBenchmark } from "./src/benchmark.ts";
import { BASE_GENOME } from "./src/genome.ts";
import { runCurriculum } from "./src/curriculum.ts";
import { simulate } from "./src/simulate.ts";
import { BENCHMARK } from "./src/worldgen.ts";

/**
 * 커리큘럼 대 단일 세계.
 *
 * 같은 유전자, 같은 총 경험량. 다른 것은 **어디서 배웠는가** 하나뿐이다.
 *
 *   커리큘럼 : 매 단계 LP가 가장 높은 세계를 골라 옮겨 다닌다
 *   단일     : 기존 세계 하나에서 끝까지 (도중에 기준 한 번 변경)
 *
 * 판정은 둘 다 처음 보는 고정 벤치마크에서. 커리큘럼이 자를 보고
 * 세계를 고른 적은 한 번도 없다.
 */

const STAGES = Number(process.env.STAGES ?? 8);
const STAGE_EPISODES = Number(process.env.STAGE_EPISODES ?? 500);
const PROBE = Number(process.env.PROBE ?? 300);
const CANDIDATES = Number(process.env.CANDIDATES ?? 5);
const BENCH = Number(process.env.BENCH ?? 800);

const TOTAL = STAGES * STAGE_EPISODES;
const pct = (x: number) => (x * 100).toFixed(1).padStart(5) + "%";

// 진화 엔진이 스스로 찾아낸 유전자. 두 에이전트가 같은 것을 쓴다 —
// 비교하려는 건 유전자가 아니라 커리큘럼이다.
const GENOME = { ...BASE_GENOME, decay: 0.98, budgetFraction: 0.1 };

console.log(`\n커리큘럼 대 단일 세계`);
console.log(`총 경험 ${TOTAL} (${STAGES}단계 × ${STAGE_EPISODES}), 판정은 고정 벤치마크 ${BENCHMARK.length}개\n`);

// ── 커리큘럼 에이전트 ─────────────────────────────────────────────
const curriculumAgent = new GenesisAgent(TOTAL + BENCH * BENCHMARK.length, GENOME);
const { stages, archive } = runCurriculum(curriculumAgent, {
  stages: STAGES,
  stageEpisodes: STAGE_EPISODES,
  probeEpisodes: PROBE,
  candidates: CANDIDATES,
  seed: 77,
});

console.log("── 커리큘럼이 고른 세계들 ───────────────────────────");
console.log("   단계  법칙  상호작용   잡음  기준변경   적합도   훈련후승인률");
for (const s of stages) {
  console.log(
    `   ${String(s.index).padStart(3)}   ${String(s.genome.lawCount).padStart(3)}` +
      `    ${(s.genome.interactionRatio * 100).toFixed(0).padStart(3)}%` +
      `   ${(s.genome.noise * 100).toFixed(0).padStart(3)}%` +
      `   ${String(s.genome.regimeAt || "-").padStart(6)}` +
      `  ${s.fitness.toFixed(3).padStart(6)}      ${pct(s.approvalAfter)}` +
      (s.fromArchive ? "  ↺아카이브" : ""),
  );
}
console.log(`   아카이브에 보관된 세계: ${archive.length}개`);

// ── 단일 세계 에이전트 ────────────────────────────────────────────
const singleAgent = new GenesisAgent(TOTAL + BENCH * BENCHMARK.length, GENOME);
simulate(() => singleAgent, {
  episodes: TOTAL,
  seed: 42,
  regimeAt: Math.floor(TOTAL / 2),
});

// ── 아무것도 모르는 대조군 ────────────────────────────────────────
const freshAgent = new GenesisAgent(BENCH * BENCHMARK.length, GENOME);

const curriculum = evaluateOnBenchmark(curriculumAgent, BENCH);
const single = evaluateOnBenchmark(singleAgent, BENCH);
const fresh = evaluateOnBenchmark(freshAgent, BENCH);

console.log("\n── 고정 벤치마크 (승인률) ───────────────────────────");
console.log("   세계      천장     신규    단일세계    커리큘럼");
for (let i = 0; i < BENCHMARK.length; i++) {
  const f = fresh.rows[i]!;
  const s = single.rows[i]!;
  const c = curriculum.rows[i]!;
  const mark = c.approval >= s.approval ? " ✓" : "";
  console.log(
    `   ${f.name.padEnd(8)} ${pct(f.ceiling)}  ${pct(f.approval)}    ${pct(s.approval)}` +
      `     ${pct(c.approval)}${mark}`,
  );
}

console.log("\n── 종합 (천장까지 남은 거리 — 작을수록 좋음) ────────");
for (const [label, r] of [
  ["신규 (아무것도 모름)", fresh],
  ["단일 세계", single],
  ["커리큘럼", curriculum],
] as const) {
  console.log(`   ${label.padEnd(22)} ${pct(r.meanGap)}   Brier ${r.meanBrier.toFixed(4)}`);
}

const delta = single.meanGap - curriculum.meanGap;
console.log(
  delta > 0
    ? `\n   → 커리큘럼이 ${(delta * 100).toFixed(1)}%p 앞섭니다.\n` +
        `     같은 경험량으로 더 넓게 일반화했습니다.\n`
    : `\n   → 커리큘럼이 앞서지 못했습니다 (${(delta * 100).toFixed(1)}%p).\n` +
        `     세계를 옮겨 다닌 것이 값을 하지 못했습니다.\n`,
);
