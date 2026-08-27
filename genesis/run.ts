import { BlindAgent, GenesisAgent, GreedyAgent } from "./src/agents.ts";
import { BASE_GENOME } from "./src/genome.ts";
import { brierOf, calibration, windows } from "./src/metrics.ts";
import { simulate } from "./src/simulate.ts";
import { World } from "./src/world.ts";
import type { Agent } from "./src/agents.ts";
import type { Experience } from "./src/types.ts";

const EPISODES = Number(process.env.EPISODES ?? 4000);
const WINDOW = Number(process.env.WINDOW ?? 500);
const SEED = Number(process.env.SEED ?? 42);
/** 기본값은 절반 지점. 0을 주면 기준이 바뀌지 않는 v0.1 세계가 된다. */
const REGIME_AT = Number(process.env.REGIME_AT ?? Math.floor(EPISODES / 2));

function pct(x: number): string {
  return (x * 100).toFixed(1).padStart(5) + "%";
}

const makers: (() => Agent)[] = [
  () => new BlindAgent(),
  () => new GreedyAgent(BASE_GENOME),
  () => new GenesisAgent(EPISODES, BASE_GENOME),
];

console.log(`\n세계  : 숨은 법칙 ${World.lawCount}개 (상호작용 1개 포함), 천장 ${pct(World.ceiling)}`);
console.log(
  REGIME_AT > 0
    ? `변화  : ${REGIME_AT}번째 에피소드에서 심사 기준 1개가 뒤집힌다`
    : `변화  : 없음 (기준 고정)`,
);
console.log(`실행  : ${EPISODES} 에피소드, 시드 ${SEED}, 모델 호출 0회, 비용 $0\n`);

const results = new Map<string, Experience[]>();
let genesisAgent: GenesisAgent | null = null;

for (const make of makers) {
  const agent = make();
  const { experiences, explored } = simulate(
    () => {
      if (agent instanceof GenesisAgent) genesisAgent = agent;
      return agent;
    },
    { episodes: EPISODES, seed: SEED, regimeAt: REGIME_AT },
  );
  results.set(agent.name, experiences);

  console.log(`── ${agent.name} ${"─".repeat(Math.max(0, 46 - agent.name.length))}`);
  console.log(`   구간        승인률    Brier      LP     탐색`);
  const ws = windows(experiences, explored, WINDOW);
  for (const w of ws) {
    const crossed = REGIME_AT > 0 && w.from <= REGIME_AT && REGIME_AT < w.to;
    console.log(
      `   ${String(w.from).padStart(5)}-${String(w.to).padEnd(5)}` +
        ` ${pct(w.approvalRate)}` +
        `  ${w.brier.toFixed(4)}` +
        `  ${w.lp >= 0 ? " " : ""}${w.lp.toFixed(2).padStart(6)}` +
        `  ${String(w.explored).padStart(5)}` +
        (crossed ? "   ← 기준 변경" : ""),
    );
  }
  console.log();
}

console.log("── 최종 비교 (마지막 구간) ──────────────────────────");
const last = (xs: Experience[]) => xs.slice(-WINDOW);
for (const [name, xs] of results) {
  const tail = last(xs);
  const approval = tail.filter((e) => e.outcome.verdict === "approved").length / tail.length;
  console.log(
    `   ${name.padEnd(30)} 승인률 ${pct(approval)}   Brier ${brierOf(tail).toFixed(4)}`,
  );
}
console.log(
  `   ${"세계의 천장".padEnd(30)} 승인률 ${pct(World.ceiling)}   Brier ${(0.08 * 0.92).toFixed(4)}\n`,
);

const genesis = results.get("Genesis (기억 + 호기심)") as Experience[];
console.log("── Genesis 캘리브레이션 (마지막 구간) ───────────────");
console.log("   예측대     건수    예측   실제    차이");
for (const r of calibration(last(genesis))) {
  console.log(
    `   ${r.band}  ${String(r.n).padStart(6)}  ${r.predicted.toFixed(2)}  ${r.actual.toFixed(2)}` +
      `  ${(r.gap >= 0 ? "+" : "") + r.gap.toFixed(2)}`,
  );
}

console.log("\n── Genesis가 스스로 발견한 금지 규칙 ────────────────");
const found = genesisAgent ? (genesisAgent as GenesisAgent).report() : [];
if (found.length === 0) {
  console.log("   (아직 없음)");
} else {
  for (const line of found) console.log(`   ${line}`);
}
if (genesisAgent) {
  const g = genesisAgent as GenesisAgent;
  console.log(`\n   호기심 예산 사용: ${g.explorationSpent}회`);

  // ── 모순 큐 (Phase 4) ───────────────────────────────────────────
  //
  // 근거는 충분한데 결과가 갈리는 셀. 여기에 아직 안 보이는 조건이
  // 숨어 있거나, 아니면 그냥 잡음이거나 — 둘 중 하나다.
  console.log("\n── 모순 큐 (설명되지 않는 갈림) ─────────────────────");
  const conflicts = g.knowledge.contradictions().slice(0, 5);
  if (conflicts.length === 0) {
    console.log("   (없음)");
  } else {
    for (const c of conflicts) {
      console.log(
        `   ${c.cell.padEnd(42)} 승인률 ${(c.rate * 100).toFixed(0)}%  근거 ${c.observed}`,
      );
    }
  }

  // ── 반사실 채점 (Phase 3) ───────────────────────────────────────
  //
  // 가지 않은 길에 대한 예측을, 다른 시점에 실제로 간 같은 길의
  // 결과와 대조한다. 채점 기준은 언제나 현실에서만 온다.
  const real = genesis.map((e) => ({
    situation: e.prediction.situation,
    approach: e.prediction.approach,
    verdict: e.outcome.verdict,
  }));
  const cf = g.imagination.scoreCounterfactuals(real);
  console.log("\n── 반사실 예측 (실행하지 않은 선택지) ───────────────");
  console.log(`   상상 ${g.imagination.size}건 중 채점 가능 ${cf.n}건`);
  if (cf.n > 0) {
    console.log(
      `   예측 평균 ${cf.meanPredicted.toFixed(2)}  실제 평균 ${cf.meanActual.toFixed(2)}` +
        `  Brier ${cf.brier.toFixed(4)}`,
    );
  }
  console.log();
}
