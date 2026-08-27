/**
 * 예측 규칙의 유전자.
 *
 * `predict.ts` 안에 상수로 박혀 있던 값들이다. 상수일 때는 내가 시뮬레이터를
 * 보고 고른 값이었고, 유전자가 되면 **이 회사의 실제 판정이 고른 값**이 된다.
 *
 * 여기 있는 것은 전부 진화가 바꿔도 되는 것이다. 바꾸면 안 되는 것 —
 * 예측 잠금, 자기채점 금지, 샌드박스 전용 — 은 `constitution.ts` 에 있고
 * 유전자가 아니다.
 */
export type PredictionGenome = {
  /** 근거가 없을 때의 사전 승인 확률. */
  prior: number;
  /** 사전값의 무게. 클수록 한 번의 경험을 덜 믿는다. */
  priorWeight: number;
  /** 한 건 거슬러 올라갈 때마다 곱해지는 무게. 낮을수록 빨리 잊는다. */
  recency: number;
  /** 확률의 아래 끝. 절대 확신은 캘리브레이션을 망친다. */
  floor: number;
  /** 확률의 위 끝. */
  ceiling: number;
};

/** 지금까지 쓰던 값. 진화의 출발점이자, 이길 상대다. */
export const BASE_GENOME: Readonly<PredictionGenome> = Object.freeze({
  prior: 0.7,
  priorWeight: 5,
  recency: 0.99,
  floor: 0.03,
  ceiling: 0.97,
});

/** 각 유전자가 움직일 수 있는 범위. 밖으로 나가면 규칙이 규칙이 아니게 된다. */
const BOUNDS: Record<keyof PredictionGenome, [number, number]> = {
  prior: [0.3, 0.95],
  priorWeight: [1, 40],
  recency: [0.9, 1],
  floor: [0.01, 0.2],
  ceiling: [0.8, 0.99],
};

/** 한 실험에서 한 유전자만 이만큼씩 움직인다 (헌법: ONE_GENE_PER_EXPERIMENT). */
const STEPS: Record<keyof PredictionGenome, number[]> = {
  prior: [-0.1, -0.05, 0.05, 0.1],
  priorWeight: [-3, -1, 1, 3, 10],
  recency: [-0.03, -0.01, -0.005, 0.005],
  floor: [-0.02, 0.02, 0.05],
  ceiling: [-0.05, -0.02, 0.02],
};

export type Candidate = {
  genome: PredictionGenome;
  /** 무엇을 바꿨는지. 사람이 읽고 납득할 수 있어야 한다. */
  gene: keyof PredictionGenome;
  from: number;
  to: number;
};

function clamp(gene: keyof PredictionGenome, value: number): number {
  const [lo, hi] = BOUNDS[gene];
  return Math.min(hi, Math.max(lo, value));
}

/**
 * 후보 목록. **한 후보당 유전자 하나만 다르다.**
 *
 * 여러 개를 동시에 바꾸면 좋아졌을 때 무엇 덕분인지 모른다. 그러면 다음 세대에
 * 무엇을 더 밀어야 할지도 모르고, 나빠졌을 때 무엇을 되돌려야 할지도 모른다.
 * 헌법이 이걸 규칙으로 못 박아 둔 이유다.
 */
export function candidatesFrom(base: PredictionGenome): Candidate[] {
  const out: Candidate[] = [];
  for (const gene of Object.keys(STEPS) as (keyof PredictionGenome)[]) {
    for (const step of STEPS[gene]) {
      const to = clamp(gene, base[gene] + step);
      if (to === base[gene]) continue;
      out.push({ genome: { ...base, [gene]: to }, gene, from: base[gene], to });
    }
  }
  return out;
}

export function describeGene(c: Candidate): string {
  const round = (n: number) => (Number.isInteger(n) ? n : Number(n.toFixed(4)));
  return `${c.gene} ${round(c.from)} → ${round(c.to)}`;
}
