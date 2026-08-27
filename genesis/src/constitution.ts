/**
 * 핵심 헌법.
 *
 * 이 파일은 진화 대상이 아니다. 그래서 유전자와 같은 파일에 있으면
 * 안 된다. 같은 설정 객체 안에 두면 언젠가 진화 루프가 여기까지
 * 손댄다 — 그리고 그건 버그가 아니라 최적화로 보일 것이다.
 * 안전 제약을 없애면 점수는 언제나 올라가니까.
 *
 * 여기 있는 것들은 코드 상수이고, 진화 엔진은 이 파일을 읽기만 한다.
 */

export const CONSTITUTION = Object.freeze({
  /** 예측은 결과를 보기 전에 커밋된다. 커밋 후 수정 불가. */
  PREDICTION_LOCK: true,

  /** 성공 여부는 세계가 판정한다. 에이전트가 자기 채점하지 않는다. */
  SELF_GRADING_FORBIDDEN: true,

  /** 진화 후보는 복제본에서만 평가한다. 운영 버전을 직접 고치지 않는다. */
  SANDBOX_ONLY_EVOLUTION: true,

  /** 한 번의 진화 실험에서 바꾸는 유전자는 하나. */
  ONE_GENE_PER_EXPERIMENT: true,

  /** 목표 지표가 좋아져도 다른 능력이 이만큼 나빠지면 탈락. */
  MAX_REGRESSION: 0.02,

  /** 후보는 여러 세계(시드)에서 검증한다. 하나만 통과한 건 과적합. */
  MIN_EVALUATION_SEEDS: 5,

  /** 진화 우선순위 중 안전이 항상 위. 점수로 상쇄할 수 없다. */
  PRIORITY: ["safety", "grounding", "cost", "learning_progress"] as const,
});

/** 진화 엔진이 자기 헌법을 고치려 하면 여기서 걸린다. */
export function assertConstitutionIntact(): void {
  if (!Object.isFrozen(CONSTITUTION)) {
    throw new Error("헌법이 동결 해제되었다. 진화를 중단한다.");
  }
}
