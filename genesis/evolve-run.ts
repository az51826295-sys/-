import { BASE_GENOME } from "./src/genome.ts";
import { describe, evaluate, generation, writeLineage } from "./src/evolve.ts";
import { CONSTITUTION } from "./src/constitution.ts";
import type { EvalOptions, LineageEntry } from "./src/evolve.ts";
import type { Genome } from "./src/genome.ts";

const EPISODES = Number(process.env.EPISODES ?? 2000);
const GENERATIONS = Number(process.env.GENERATIONS ?? 2);
const WINDOW = Number(process.env.WINDOW ?? 400);

const options: EvalOptions = {
  episodes: EPISODES,
  seeds: [42, 43, 44, 45, 46],
  regimeAt: Math.floor(EPISODES / 2),
  window: WINDOW,
};

const pct = (x: number) => (x * 100).toFixed(1).padStart(5) + "%";
const sign = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%p";

console.log(`\n자기진화 엔진 — Phase 5`);
console.log(`평가  : ${options.seeds.length}개 세계 × ${EPISODES} 에피소드 (헌법 최소 ${CONSTITUTION.MIN_EVALUATION_SEEDS}개)`);
console.log(`제약  : 한 실험에 유전자 1개, 회귀 허용치 ${CONSTITUTION.MAX_REGRESSION}`);
console.log(`샌드박스: 모든 후보는 새 개체로 평가된다. 운영 개체는 존재하지 않는다.\n`);

let current: Genome = BASE_GENOME;
let currentEval = evaluate(current, options);
const lineage: LineageEntry[] = [];

console.log(`기준 개체  ${describe(current)}`);
console.log(
  `           승인률 ${pct(currentEval.approval)}  Brier ${currentEval.brier.toFixed(4)}` +
    `  적응력 ${pct(currentEval.recovery)}  탐색 ${pct(currentEval.explorationCost)}\n`,
);

for (let gen = 1; gen <= GENERATIONS; gen++) {
  console.log(`── 세대 ${gen} ────────────────────────────────────────`);
  const candidates = generation(current, currentEval, options);

  console.log(`   유전자              값        승인률    변화      판정`);
  for (const c of candidates) {
    const verdict = c.rejected ? `탈락 (${c.rejected})` : "통과";
    console.log(
      `   ${c.gene.padEnd(19)} ${String(c.value).padEnd(8)} ` +
        `${pct(c.evaluation.approval)}  ${sign(c.delta).padStart(8)}   ${verdict}`,
    );
  }

  const winner = candidates.find((c) => !c.rejected && c.delta > 0.002);

  for (const c of candidates) {
    lineage.push({
      generation: gen,
      parent: describe(current),
      gene: c.gene,
      value: c.value,
      delta: c.delta,
      decision: c === winner ? "adopted" : "rejected",
      reason: c.rejected ?? (c === winner ? "최고 개선" : "개선 부족 또는 차점"),
      evaluation: c.evaluation,
    });
  }

  if (!winner) {
    console.log(`\n   채택 없음 — 유의한 개선이 있는 후보가 없다. 진화 중단.\n`);
    break;
  }

  console.log(
    `\n   채택: ${winner.gene} = ${String(winner.value)}   ` +
      `승인률 ${sign(winner.delta)}  적응력 ${sign(winner.evaluation.recovery - currentEval.recovery)}\n`,
  );
  current = winner.genome;
  currentEval = winner.evaluation;
}

console.log("── 최종 개체 ────────────────────────────────────────");
console.log(`   ${describe(current)}`);
console.log(
  `   승인률 ${pct(currentEval.approval)}  Brier ${currentEval.brier.toFixed(4)}` +
    `  적응력 ${pct(currentEval.recovery)}  탐색 ${pct(currentEval.explorationCost)}`,
);
const baseEval = lineage.length ? null : null;
console.log(`\n   계보 ${lineage.length}건 기록 → genesis/data/evolution.json\n`);

writeLineage(lineage, "C:/Users/az518/Desktop/ai-workforce/genesis/data/evolution.json");
void baseEval;
