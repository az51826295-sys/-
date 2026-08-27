import { Ledger } from "./ledger.ts";
import { World } from "./world.ts";
import type { Agent } from "./agents.ts";
import type { Experience } from "./types.ts";
import type { WorldSpec } from "./world.ts";

export type Run = {
  experiences: Experience[];
  explored: boolean[];
};

export type RunOptions = {
  episodes: number;
  seed: number;
  /** 이 에피소드에서 세계의 심사 기준이 바뀐다. 0이면 고정. */
  regimeAt?: number;
  /** 생성된 세계를 쓸 때. 없으면 기본 다섯 법칙 세계. */
  spec?: WorldSpec;
  /** 예측 원장을 파일로 남길 경로. */
  ledgerPath?: string;
};

/**
 * 한 에이전트를 세상에 풀어놓는다.
 *
 * 순서가 전부다:
 *   상황 관측 → 행동 결정 → 예측 커밋 → 행동 → 결과 → 오차 → 학습
 *
 * 예측 커밋이 행동보다 먼저이고, 행동이 결과보다 먼저다. 이 순서가
 * 뒤집힐 수 없도록 원장이 강제한다. 이 함수는 진화 엔진에서도 그대로
 * 쓰인다 — 후보 유전자를 평가하는 샌드박스가 곧 이것이다.
 */
export function simulate(
  makeAgent: () => Agent,
  { episodes, seed, regimeAt = 0, spec, ledgerPath }: RunOptions,
): Run {
  const agent = makeAgent();
  const world = new World(seed, spec ?? regimeAt);
  const ledger = new Ledger(ledgerPath);
  const experiences: Experience[] = [];
  const explored: boolean[] = [];

  for (let episode = 1; episode <= episodes; episode++) {
    const situation = world.nextSituation();
    const choice = agent.decide(situation);

    // ── 예측 잠금 ────────────────────────────────────────────────
    const prediction = ledger.commit({
      episode,
      situation,
      approach: choice.approach,
      pApproved: choice.pApproved,
      basis: choice.basis,
    });

    // ── 행동, 그리고 세상의 판정 ─────────────────────────────────
    const { verdict, violations } = world.judge(situation, choice.approach);

    const experience = ledger.settle({
      predictionId: prediction.id,
      observedAt: episode,
      verdict,
      violationsHidden: violations,
    });

    agent.learn(situation, choice.approach, verdict === "approved");
    experiences.push(experience);
    explored.push(choice.explored);
  }

  if (ledger.openPredictions !== 0) {
    throw new Error(`결과가 붙지 않은 예측 ${ledger.openPredictions}건`);
  }
  ledger.flush();

  return { experiences, explored };
}
