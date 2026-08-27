import { GenesisAgent } from "./src/agents.ts";
import { CONSTITUTION, assertConstitutionIntact } from "./src/constitution.ts";
import { BASE_GENOME } from "./src/genome.ts";
import { BENCHMARK, assertBenchmarkIntact, isSolvable } from "./src/worldgen.ts";
import { readFileSync } from "node:fs";
import { Ledger } from "./src/ledger.ts";
import { simulate } from "./src/simulate.ts";
import { World } from "./src/world.ts";

/**
 * 헌법 검증 (Phase 6).
 *
 * "예측은 잠긴다", "자기 채점은 불가능하다", "상상은 현실에 섞이지
 * 않는다" — 이건 문서에 적어 두면 지켜지는 것이 아니라, 어길 수
 * 없어야 지켜지는 것이다.
 *
 * 그래서 각 주장마다 **실제로 위반을 시도하고 막히는지** 본다.
 * 통과하지 못하면 그 주장은 주장일 뿐이다.
 */

let passed = 0;
let failed = 0;

function must(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`   ✓ ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`   ✗ ${name}`);
    console.log(`     ${(e as Error).message}`);
    failed += 1;
  }
}

function expectThrow(what: string, fn: () => void): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(`막혔어야 하는데 통과했다: ${what}`);
}

console.log("\n헌법 검증 — 위반을 실제로 시도한다\n");

console.log("── 예측 잠금 ────────────────────────────────────────");

must("커밋된 예측은 수정할 수 없다", () => {
  const ledger = new Ledger();
  const p = ledger.commit({
    episode: 1,
    situation: { kind: "research", audience: "team", urgency: "low" },
    approach: { depth: "deep", length: "short", cites: "yes", tone: "formal" },
    pApproved: 0.3,
    basis: "test",
  });
  // 결과를 보고 나서 예측을 유리하게 고치려는 시도
  expectThrow("동결된 예측 수정", () => {
    "use strict";
    (p as { pApproved: number }).pApproved = 0.95;
  });
  if (p.pApproved !== 0.3) throw new Error(`예측이 바뀌었다: ${p.pApproved}`);
});

must("같은 예측에 결과를 두 번 붙일 수 없다", () => {
  const ledger = new Ledger();
  const p = ledger.commit({
    episode: 1,
    situation: { kind: "summary", audience: "team", urgency: "high" },
    approach: { depth: "deep", length: "short", cites: "yes", tone: "formal" },
    pApproved: 0.5,
    basis: "test",
  });
  ledger.settle({ predictionId: p.id, observedAt: 1, verdict: "revision", violationsHidden: [] });
  // 마음에 안 드는 결과를 승인으로 덮어쓰려는 시도
  expectThrow("결과 재기록", () =>
    ledger.settle({ predictionId: p.id, observedAt: 1, verdict: "approved", violationsHidden: [] }),
  );
});

must("등록되지 않은 예측에는 결과를 붙일 수 없다", () => {
  const ledger = new Ledger();
  // 예측 없이 좋은 결과만 만들어 넣으려는 시도
  expectThrow("유령 결과", () =>
    ledger.settle({
      predictionId: "PRD-9999999",
      observedAt: 1,
      verdict: "approved",
      violationsHidden: [],
    }),
  );
});

must("예측 없이 끝난 에피소드가 남으면 실행이 실패한다", () => {
  const ledger = new Ledger();
  ledger.commit({
    episode: 1,
    situation: { kind: "outreach", audience: "client", urgency: "low" },
    approach: { depth: "deep", length: "short", cites: "yes", tone: "formal" },
    pApproved: 0.5,
    basis: "test",
  });
  if (ledger.openPredictions !== 1) throw new Error("미결 예측이 감지되지 않았다");
});

console.log("\n── 채점권 분리 ──────────────────────────────────────");

must("에이전트는 자기 결과를 판정할 수 없다", () => {
  // 세계의 judge() 는 에이전트가 접근할 수 없는 곳에 있고,
  // 에이전트 인터페이스에는 결과를 쓰는 메서드가 존재하지 않는다.
  const agent = new GenesisAgent(100);
  const surface = new Set<string>();
  let proto: object | null = Object.getPrototypeOf(agent);
  while (proto && proto !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(proto)) surface.add(k);
    proto = Object.getPrototypeOf(proto);
  }
  for (const forbidden of ["judge", "grade", "setVerdict", "approve"]) {
    if (surface.has(forbidden)) throw new Error(`에이전트에 채점 메서드가 있다: ${forbidden}`);
  }
  // learn() 은 결과를 받기만 한다. 결과를 만들어내지 않는다.
  if (!surface.has("learn")) throw new Error("learn 이 없다");
});

must("성적은 로그에서 계산된다 (자기보고 필드 없음)", () => {
  const { experiences } = simulate(() => new GenesisAgent(200), {
    episodes: 200,
    seed: 1,
  });
  const sample = experiences[0];
  if (!sample) throw new Error("경험이 없다");
  const fields = Object.keys(sample);
  for (const f of fields) {
    if (/self|claim|report|score/i.test(f)) {
      throw new Error(`경험에 자기보고 필드가 있다: ${f}`);
    }
  }
  // 오차는 예측과 결과에서 유도된 값이지 기록된 값이 아니다
  const actual = sample.outcome.verdict === "approved" ? 1 : 0;
  const expected = Math.abs(sample.prediction.pApproved - actual);
  if (Math.abs(sample.error - expected) > 1e-9) {
    throw new Error("오차가 예측·결과와 일치하지 않는다");
  }
});

console.log("\n── 상상과 현실의 분리 ───────────────────────────────");

must("상상은 경험 원장에 들어가지 않는다", () => {
  const agent = new GenesisAgent(300);
  const { experiences } = simulate(() => agent, { episodes: 300, seed: 5 });
  // 16개 조합을 매번 상상하므로 상상 수는 경험 수의 16배여야 한다
  if (agent.imagination.size !== 300 * 16) {
    throw new Error(`상상 수가 맞지 않는다: ${agent.imagination.size}`);
  }
  if (experiences.length !== 300) {
    throw new Error(`경험 수가 오염됐다: ${experiences.length}`);
  }
  // 실제로 간 길은 에피소드당 정확히 하나
  if (agent.imagination.takenCount !== 300) {
    throw new Error(`선택된 상상 수가 맞지 않는다: ${agent.imagination.takenCount}`);
  }
});

must("상상 저장소에는 현실로 승격시키는 경로가 없다", () => {
  const agent = new GenesisAgent(10);
  const surface = new Set(
    Object.getOwnPropertyNames(Object.getPrototypeOf(agent.imagination)),
  );
  for (const forbidden of ["promote", "commit", "toExperience", "settle"]) {
    if (surface.has(forbidden)) throw new Error(`승격 경로가 있다: ${forbidden}`);
  }
});

console.log("\n── 진화 경계 ────────────────────────────────────────");

must("헌법은 동결되어 있다", () => {
  assertConstitutionIntact();
  expectThrow("헌법 수정", () => {
    "use strict";
    (CONSTITUTION as { MAX_REGRESSION: number }).MAX_REGRESSION = 999;
  });
  if (CONSTITUTION.MAX_REGRESSION !== 0.02) throw new Error("헌법이 바뀌었다");
});

must("헌법 상수는 유전자에 포함되지 않는다", () => {
  for (const gene of Object.keys(BASE_GENOME)) {
    if (gene in CONSTITUTION) throw new Error(`진화 가능한 헌법 항목: ${gene}`);
  }
});

console.log("\n── 벤치마크 무결성 ──────────────────────────────────");

must("벤치마크는 동결되어 있다", () => {
  assertBenchmarkIntact();
  expectThrow("벤치마크 배열 수정", () => {
    "use strict";
    (BENCHMARK as unknown as unknown[]).push({});
  });
});

must("벤치마크 세계는 모두 풀 수 있다", () => {
  // 도달 불가능한 천장을 기준으로 성적을 재면 아무것도 알 수 없다.
  for (const { name, spec } of BENCHMARK) {
    if (!isSolvable(spec.laws)) throw new Error(`풀 수 없는 벤치마크 세계: ${name}`);
  }
});

must("벤치마크는 유전자와 무관하다", () => {
  // 자가 진화 대상과 연결되어 있으면 자가 아니다.
  const source = readFileSync(
    new URL("./src/worldgen.ts", import.meta.url),
    "utf8",
  );
  if (/from "\.\/genome\.ts"/.test(source)) {
    throw new Error("벤치마크가 유전자 모듈을 참조한다");
  }
});

console.log("\n── 세계의 무결성 ────────────────────────────────────");

must("같은 시드는 같은 세계를 만든다", () => {
  const a = new World(99, 500);
  const b = new World(99, 500);
  for (let i = 0; i < 200; i++) {
    if (JSON.stringify(a.nextSituation()) !== JSON.stringify(b.nextSituation())) {
      throw new Error(`시드 ${99} 에서 세계가 갈라졌다 (에피소드 ${i})`);
    }
  }
});

must("행동이 달라도 상황 순서는 같다", () => {
  const runA = simulate(() => new GenesisAgent(300), { episodes: 300, seed: 7 });
  const runB = simulate(() => new (class extends GenesisAgent {})(300), {
    episodes: 300,
    seed: 7,
  });
  for (let i = 0; i < 300; i++) {
    const x = runA.experiences[i]?.prediction.situation;
    const y = runB.experiences[i]?.prediction.situation;
    if (JSON.stringify(x) !== JSON.stringify(y)) {
      throw new Error(`에피소드 ${i} 에서 상황이 갈라졌다`);
    }
  }
});

console.log(`\n${"─".repeat(52)}`);
console.log(`   통과 ${passed} / 실패 ${failed}\n`);
if (failed > 0) process.exitCode = 1;
