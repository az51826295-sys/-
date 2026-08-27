import type { Approach, Situation, Verdict } from "./types.ts";

/**
 * 상상 저장소 (Phase 3, 6절).
 *
 * 에이전트는 행동하기 전에 16가지 접근을 전부 머릿속에서 돌려보고
 * 하나를 고른다. 고르지 않은 15개에 대한 예측도 예측이다 — 다만
 * **현실이 아니다.** 아무도 그 결과를 확인해 주지 않았다.
 *
 * 이 파일이 존재하는 이유는 그 15개가 경험 원장에 절대 섞이지
 * 않게 하는 것이다. 섞이면 AI는 자기 상상을 근거로 자기 믿음을
 * 강화하고, 몇 사이클 안에 현실과 무관한 정합적 환상에 도달한다.
 *
 * 그래서 승격 경로를 아예 만들지 않았다. 상상은 영원히 상상으로
 * 남는다. 나중에 같은 조건에서 같은 접근을 실제로 시도해 결과가
 * 나오면, 그건 **새로운 현실 경험**으로 기록되고 과거의 상상은
 * 그것을 맞혔는지 채점당하는 대상이 될 뿐이다.
 */

export type ImaginedPrediction = {
  episode: number;
  situation: Situation;
  approach: Approach;
  pApproved: number;
  /** 실제로 이 접근을 골랐는가. false면 순수한 반사실. */
  taken: boolean;
};

function key(s: Situation, a: Approach): string {
  return `${s.kind}|${s.audience}|${s.urgency}||${a.depth}|${a.length}|${a.cites}|${a.tone}`;
}

export class Imagination {
  private records: ImaginedPrediction[] = [];

  /** 행동 이전, 후보 하나에 대한 내부 예측을 남긴다. */
  record(r: ImaginedPrediction): void {
    this.records.push(Object.freeze(r));
  }

  /**
   * 반사실 채점.
   *
   * "가지 않은 길"에 대한 예측을, 나중에 **다른 시점에 실제로 간**
   * 같은 길의 결과와 대조한다. 이게 Phase 3 성공 기준 2번
   * (실행하지 않은 행동의 결과를 내부에서 비교한다)의 측정이다.
   *
   * 중요한 제약: 채점 기준이 되는 결과는 반드시 현실 경험에서
   * 온다. 상상끼리 비교하는 경로는 없다.
   */
  scoreCounterfactuals(
    realOutcomes: { situation: Situation; approach: Approach; verdict: Verdict }[],
    /** 이 에피소드 이후의 현실 결과만 채점에 쓴다 (미래 정보 금지). */
  ): { n: number; brier: number; meanPredicted: number; meanActual: number } {
    // 조건+접근별 실제 승인률 (현실에서만 집계)
    const actual = new Map<string, { ok: number; n: number }>();
    for (const o of realOutcomes) {
      const k = key(o.situation, o.approach);
      const c = actual.get(k) ?? { ok: 0, n: 0 };
      c.n += 1;
      if (o.verdict === "approved") c.ok += 1;
      actual.set(k, c);
    }

    let n = 0;
    let brier = 0;
    let predictedSum = 0;
    let actualSum = 0;

    for (const r of this.records) {
      if (r.taken) continue; // 실제로 간 길은 반사실이 아니다
      const c = actual.get(key(r.situation, r.approach));
      if (!c || c.n < 3) continue; // 채점할 현실 근거가 부족
      const rate = c.ok / c.n;
      n += 1;
      brier += (r.pApproved - rate) ** 2;
      predictedSum += r.pApproved;
      actualSum += rate;
    }

    return {
      n,
      brier: n === 0 ? NaN : brier / n,
      meanPredicted: n === 0 ? NaN : predictedSum / n,
      meanActual: n === 0 ? NaN : actualSum / n,
    };
  }

  get size(): number {
    return this.records.length;
  }

  get takenCount(): number {
    return this.records.filter((r) => r.taken).length;
  }
}
