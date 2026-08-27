import type { Experience } from "./types.ts";

export type Window = {
  from: number;
  to: number;
  approvalRate: number;
  /** Brier score. 확률 예측의 정확도 + 캘리브레이션을 한 수로 본다. */
  brier: number;
  /** 학습 진행률 — 이전 구간 대비 오차가 얼마나 줄었는가. */
  lp: number;
  explored: number;
};

/**
 * 구간별 지표.
 *
 * LP(Learning Progress)가 이 파일의 존재 이유다. 오차의 크기가 아니라
 * 오차의 하강 속도를 본다. 이 값이 0으로 수렴하면 둘 중 하나다 —
 * 다 배웠거나, 더 배울 수 없는 것(환경 잡음) 앞에 서 있거나.
 * 어느 쪽이든 여기서 계속 비용을 쓰면 안 된다는 신호는 같다.
 */
export function windows(
  experiences: Experience[],
  exploredFlags: boolean[],
  size: number,
): Window[] {
  const out: Window[] = [];
  let prevBrier: number | null = null;

  for (let start = 0; start + size <= experiences.length; start += size) {
    const slice = experiences.slice(start, start + size);
    const approved = slice.filter((e) => e.outcome.verdict === "approved").length;
    const brier =
      slice.reduce((sum, e) => {
        const actual = e.outcome.verdict === "approved" ? 1 : 0;
        return sum + (e.prediction.pApproved - actual) ** 2;
      }, 0) / slice.length;

    const cost = slice.reduce((sum, e) => sum + e.cost, 0);
    const lp = prevBrier === null ? 0 : ((prevBrier - brier) / cost) * 1000;

    out.push({
      from: start + 1,
      to: start + size,
      approvalRate: approved / slice.length,
      brier,
      lp,
      explored: exploredFlags.slice(start, start + size).filter(Boolean).length,
    });
    prevBrier = brier;
  }
  return out;
}

/**
 * 캘리브레이션 표.
 *
 * "0.7이라고 말한 예측들 중 실제로 70%가 승인됐는가."
 * 이걸 재지 않으면 confidence 숫자는 장식이고, 확신에 차서 틀리는
 * 시스템이 된다.
 */
export function calibration(experiences: Experience[], buckets = 5) {
  const rows = Array.from({ length: buckets }, (_, i) => ({
    lo: i / buckets,
    hi: (i + 1) / buckets,
    n: 0,
    predictedSum: 0,
    actualSum: 0,
  }));

  for (const e of experiences) {
    const idx = Math.min(buckets - 1, Math.floor(e.prediction.pApproved * buckets));
    const row = rows[idx] as (typeof rows)[number];
    row.n += 1;
    row.predictedSum += e.prediction.pApproved;
    row.actualSum += e.outcome.verdict === "approved" ? 1 : 0;
  }

  return rows
    .filter((r) => r.n > 0)
    .map((r) => ({
      band: `${r.lo.toFixed(1)}–${r.hi.toFixed(1)}`,
      n: r.n,
      predicted: r.predictedSum / r.n,
      actual: r.actualSum / r.n,
      gap: r.predictedSum / r.n - r.actualSum / r.n,
    }));
}

export function brierOf(experiences: Experience[]): number {
  return (
    experiences.reduce((sum, e) => {
      const actual = e.outcome.verdict === "approved" ? 1 : 0;
      return sum + (e.prediction.pApproved - actual) ** 2;
    }, 0) / experiences.length
  );
}
