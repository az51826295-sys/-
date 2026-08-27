/** 세계의 관측 가능한 조건. 에이전트가 볼 수 있는 전부. */
export type Situation = {
  kind: "research" | "outreach" | "summary";
  audience: "executive" | "team" | "client";
  urgency: "low" | "high";
};

/** 에이전트가 고를 수 있는 행동. 네 개의 축. */
export type Approach = {
  depth: "shallow" | "deep";
  length: "short" | "long";
  cites: "yes" | "no";
  tone: "formal" | "casual";
};

export const APPROACH_AXES = {
  depth: ["shallow", "deep"],
  length: ["short", "long"],
  cites: ["yes", "no"],
  tone: ["formal", "casual"],
} as const;

export type Verdict = "approved" | "revision" | "rejected";

/**
 * 예측. 행동 이전에, 결과를 보기 전에 커밋된다.
 *
 * pApproved 는 확률이어야 한다. 캘리브레이션을 측정할 수 없는
 * 예측은 측정되지 않은 예측이고, 측정되지 않은 예측은 성장의
 * 근거가 되지 못한다.
 */
export type Prediction = {
  id: string;
  episode: number;
  committedAt: number;
  situation: Situation;
  approach: Approach;
  pApproved: number;
  /** 어떤 근거로 이 확률이 나왔는가. 사후 분석용. */
  basis: string;
};

/** 결과. 예측 행을 수정하지 않고 별도로 붙는다. */
export type Outcome = {
  predictionId: string;
  observedAt: number;
  verdict: Verdict;
  /** 세계가 실제로 무엇을 문제 삼았는지. 에이전트에게는 주지 않는다. */
  violationsHidden: string[];
};

/**
 * 경험 한 건 = 예측 + 결과 + 그 차이.
 *
 * 예측이 없는 기록은 경험이 아니라 로그다.
 */
export type Experience = {
  prediction: Prediction;
  outcome: Outcome;
  /** |예측확률 − 실제(0/1)|. 이것이 성장의 원료다. */
  error: number;
  cost: number;
};
