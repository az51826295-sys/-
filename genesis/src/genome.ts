/**
 * 전략 유전자 (Phase 5, 20절).
 *
 * 프로그램 전체를 다시 쓰는 대신 정책 값을 진화시킨다. 여기 있는
 * 값들은 전부 진화 엔진이 바꿔도 되는 것들이다. 바꾸면 안 되는 것은
 * constitution.ts 에 따로 있다.
 */
export type Genome = {
  /** 오래된 경험을 잊는 속도. 1에 가까울수록 오래 기억한다. */
  decay: number;
  /** 근거가 없을 때의 사전 승인 확률. */
  prior: number;
  /** 사전값의 무게. 클수록 한 번의 경험을 덜 믿는다. */
  priorWeight: number;
  /** 탐색률의 하한. 완전히 0이 되면 변화에 적응하지 못한다. */
  explorationFloor: number;
  /** 탐색률이 절반으로 줄어드는 데 걸리는 에피소드 수. */
  explorationHalfLife: number;
  /** 전체 에피소드 중 탐색에 쓸 수 있는 최대 비율 (호기심 예산). */
  budgetFraction: number;
  /**
   * 놀람이 호기심을 얼마나 다시 켜는가.
   *
   * 0이면 호기심은 시간이 지나면 식기만 하고 다시 뜨거워지지 않는다 —
   * 오래 배운 개체일수록 새 환경에서 확신에 차고 호기심이 없는 상태로
   * 들어간다. 고정 벤치마크가 이 실패를 잡아냈고, 그래서 이 유전자가
   * 생겼다.
   */
  surpriseGain: number;
  /** 놀람이 크면 값 기억을 버리고 관계만 남길 것인가. */
  forgetOnSurprise: boolean;
  /** 실험할 축을 고를 때 관계층을 얼마나 볼 것인가. */
  relationalWeight: number;
  /**
   * 구조 유전자 — 맥락 특징을 쌍으로도 기억할 것인가.
   *
   * 이것만 성격이 다르다. 나머지는 숫자 조절이지만 이건 기억의
   * 표현력 자체를 바꾼다 (Phase 5의 Level 5, 모듈 구조).
   * 켜면 "A이면서 동시에 B일 때"라는 조건을 배울 수 있게 되고,
   * 대신 셀 수가 세 배로 늘어 학습이 느려진다.
   */
  pairContexts: boolean;
};

export const BASE_GENOME: Genome = Object.freeze({
  decay: 0.997,
  prior: 0.7,
  priorWeight: 5,
  explorationFloor: 0.05,
  explorationHalfLife: 250,
  budgetFraction: 0.2,
  surpriseGain: 2.0,
  forgetOnSurprise: false,
  relationalWeight: 0,
  pairContexts: false,
});

export type GeneName = keyof Genome;

/**
 * 돌연변이 후보.
 *
 * 유전자 하나당 시도해 볼 값들. 한 번의 실험에서 하나만 바꾼다
 * (헌법 ONE_GENE_PER_EXPERIMENT). 여러 개를 동시에 바꾸면 성능이
 * 올라가도 무엇 덕분인지 알 수 없고, 그건 학습이 아니다.
 */
export const MUTATIONS: { [K in GeneName]: Genome[K][] } = {
  decay: [0.98, 0.99, 0.9995],
  prior: [0.5, 0.85],
  priorWeight: [2, 10],
  explorationFloor: [0.02, 0.1, 0.2],
  explorationHalfLife: [100, 600],
  budgetFraction: [0.1, 0.35],
  surpriseGain: [0, 1.0, 4.0],
  forgetOnSurprise: [true],
  relationalWeight: [1.0, 3.0],
  pairContexts: [true],
};

export function mutate<K extends GeneName>(
  base: Genome,
  gene: K,
  value: Genome[K],
): Genome {
  return Object.freeze({ ...base, [gene]: value });
}

export function describe(g: Genome): string {
  return [
    `decay=${g.decay}`,
    `prior=${g.prior}`,
    `pw=${g.priorWeight}`,
    `eFloor=${g.explorationFloor}`,
    `eHalf=${g.explorationHalfLife}`,
    `budget=${g.budgetFraction}`,
    `surprise=${g.surpriseGain}`,
    `forget=${g.forgetOnSurprise ? "on" : "off"}`,
    `rel=${g.relationalWeight}`,
    `pairs=${g.pairContexts ? "on" : "off"}`,
  ].join(" ");
}
