import { BASE_GENOME } from "./genome.ts";
import { Imagination } from "./imagination.ts";
import { SemanticMemory } from "./memory.ts";
import { makeRng, pick } from "./rng.ts";
import { APPROACH_AXES } from "./types.ts";
import type { Genome } from "./genome.ts";
import type { Approach, Situation } from "./types.ts";

export type Choice = {
  approach: Approach;
  pApproved: number;
  basis: string;
  explored: boolean;
};

export interface Agent {
  readonly name: string;
  decide(s: Situation): Choice;
  learn(s: Situation, a: Approach, approved: boolean): void;
  report(): string[];
}

/** 접근 조합 전체. 4축 × 2값 = 16가지. 전수 탐색이 가능한 크기다. */
export const ALL_APPROACHES: Approach[] = (() => {
  const out: Approach[] = [];
  for (const depth of APPROACH_AXES.depth)
    for (const length of APPROACH_AXES.length)
      for (const cites of APPROACH_AXES.cites)
        for (const tone of APPROACH_AXES.tone)
          out.push({ depth, length, cites, tone });
  return out;
})();

/**
 * 기준선 A — 기억 없는 에이전트.
 *
 * 무작위로 행동하고, 예측은 지금까지의 승인률(=최선의 상수 예측기)로
 * 낸다. 일부러 약하게 만든 게 아니다. 상수 예측기는 캘리브레이션
 * 관점에서 꽤 강한 기준선이고, Genesis가 이것을 못 이기면 축적은
 * 일어나지 않은 것이다.
 */
export class BlindAgent implements Agent {
  readonly name = "Blind (기억 없음)";
  private rng = makeRng(7);
  private approvedSoFar = 0;
  private seen = 0;

  decide(_s: Situation): Choice {
    const base = this.seen === 0 ? 0.5 : this.approvedSoFar / this.seen;
    return {
      approach: pick(this.rng, ALL_APPROACHES),
      pApproved: Math.min(0.97, Math.max(0.02, base)),
      basis: "전체 승인률",
      explored: false,
    };
  }

  learn(_s: Situation, _a: Approach, approved: boolean): void {
    this.seen += 1;
    if (approved) this.approvedSoFar += 1;
  }

  report(): string[] {
    return [];
  }
}

/**
 * 기준선 B — 기억은 쓰되 탐색은 안 하는 에이전트.
 *
 * 이 기준선이 있어야 "호기심이 실제로 값을 하는가"를 분리해서 볼 수
 * 있다. Phase 4가 필요한지를 판정하는 대조군이다.
 */
export class GreedyAgent implements Agent {
  // 하위 클래스가 자기 이름을 붙일 수 있도록 리터럴이 아니라 string.
  readonly name: string = "Greedy (기억만, 탐색 없음)";
  protected memory: SemanticMemory;
  protected readonly genome: Genome;
  /** 가지 않은 길에 대한 예측. 경험 원장과 물리적으로 분리되어 있다. */
  readonly imagination = new Imagination();
  protected episodeCount = 0;

  constructor(genome: Genome = BASE_GENOME) {
    this.genome = genome;
    this.memory = new SemanticMemory(genome);
  }

  decide(s: Situation): Choice {
    this.episodeCount += 1;

    // 16가지 접근을 전부 머릿속에서 돌려보고 하나를 고른다.
    // 고르지 않은 15개의 예측도 기록하지만, 상상 저장소로 간다 —
    // 결과가 붙지 않은 예측은 경험이 아니기 때문이다.
    let best = ALL_APPROACHES[0] as Approach;
    let bestP = -1;
    let basis = "";
    const scored: { a: Approach; p: number }[] = [];
    for (const a of ALL_APPROACHES) {
      const { p, weakest } = this.memory.predict(s, a);
      scored.push({ a, p });
      if (p > bestP) {
        bestP = p;
        best = a;
        basis = weakest;
      }
    }
    for (const { a, p } of scored) {
      this.imagination.record({
        episode: this.episodeCount,
        situation: s,
        approach: a,
        pApproved: p,
        taken: a === best,
      });
    }

    return { approach: best, pApproved: bestP, basis, explored: false };
  }

  learn(s: Situation, a: Approach, approved: boolean): void {
    this.memory.learn(s, a, approved);
  }

  report(): string[] {
    return this.memory
      .discoveredProhibitions()
      .map(
        (r) => `${r.rule}  →  승인률 ${(r.rate * 100).toFixed(0)}% (근거 ${r.observed})`,
      );
  }

  /** 모순 큐와 모름의 지도. 리포트용. */
  get knowledge(): SemanticMemory {
    return this.memory;
  }
}

/**
 * Genesis 에이전트 — 기억 + 호기심 예산.
 *
 * Phase 4의 세 가지를 최소 형태로 구현한다.
 *
 *  · 탐색과 활용의 균형 (12절) — 기본은 활용, 예산 안에서만 탐색.
 *  · 호기심 예산 (13절) — 탐색 횟수에 상한. 없으면 호기심은 목표
 *    수행을 영원히 미루는 장치가 된다.
 *  · 잡음 중독 방지 (14절) — 탐색 대상은 "예측이 안 되는 곳"이
 *    아니라 "근거가 적은 곳". 오차의 크기가 아니라 오차를 줄일 수
 *    있는 여지를 쫓기 때문에 잡음 앞에 멈춰 서지 않는다.
 *
 * 중요한 규칙 하나: 탐색으로 고른 행동이라도 커밋하는 예측은 그
 * 행동에 대한 정직한 확률이다. 낮은 확률을 알면서 실험하는 것이지,
 * 실험이라고 예측을 얼버무리지 않는다.
 */
export class GenesisAgent extends GreedyAgent {
  readonly name = "Genesis (기억 + 호기심)";
  private rng = makeRng(11);
  private spent = 0;
  private episode = 0;
  private readonly budget: number;

  /**
   * 놀람 추적 (Phase 4, 3.2절 — 예측 오류 기반 호기심).
   *
   * 빠른 평균과 느린 평균을 함께 들고 있다가, 빠른 쪽이 느린 쪽보다
   * 높아지면 "세상이 달라졌다"는 신호로 읽는다.
   *
   * 이게 없으면 호기심이 에피소드 수에 따라서만 식는다. 그러면 오래
   * 배운 에이전트일수록 새 세계에서 **확신에 차고 호기심이 없는**
   * 상태로 들어가고, 낡은 믿음을 고칠 기회를 스스로 닫는다.
   * 고정 벤치마크가 정확히 그 실패를 잡아냈다.
   */
  private fastError = 0.5;
  private slowError = 0.5;
  /** 직전에 커밋한 예측. 놀람 계산의 기준이 된다. */
  private lastP = 0.5;
  /** 마지막으로 값 기억을 버린 에피소드. 연속 초기화를 막는다. */
  private lastForget = -1000;

  constructor(episodes: number, genome: Genome = BASE_GENOME) {
    super(genome);
    this.budget = Math.floor(episodes * genome.budgetFraction);
  }

  decide(s: Situation): Choice {
    this.episode += 1;
    const exploit = super.decide(s);

    // 시간이 지나서 식는 항 + 놀라서 다시 뜨거워지는 항.
    const cooling = 0.6 * Math.exp(-this.episode / this.genome.explorationHalfLife);
    const surprise = Math.max(0, this.fastError - this.slowError);
    const epsilon = Math.min(
      0.6,
      Math.max(this.genome.explorationFloor, cooling) + surprise * this.genome.surpriseGain,
    );

    // 예산은 평생 횟수가 아니라 **비율**이다. 평생 횟수로 두면 한 번
    // 다 쓴 뒤에는 세상이 뒤집혀도 실험할 수 없다.
    const withinBudget =
      this.spent < this.budget ||
      this.spent / this.episode < this.genome.budgetFraction;

    if (withinBudget && this.rng() < epsilon) {
      // ── 통제 실험 ────────────────────────────────────────────
      //
      // 가장 모르는 조합으로 뛰어들면 안 된다. 네 축을 한꺼번에
      // 바꾼 행동이 실패하면 무엇 때문에 실패했는지 알 수 없고,
      // 그 실패는 네 축 전부에게 똑같이 청구된다. 그렇게 쌓인
      // 통계는 상관일 뿐 인과가 아니다.
      //
      // 그래서 현재 최선을 기준으로 삼고 딱 한 축만 뒤집는다.
      // 나머지를 고정했으니 결과의 차이는 그 축의 것이다.
      let target = exploit.approach;
      let bestScore = -1;
      for (const axis of Object.keys(APPROACH_AXES) as (keyof Approach)[]) {
        const flipped = {
          ...exploit.approach,
          [axis]: APPROACH_AXES[axis].find((v) => v !== exploit.approach[axis]),
        } as Approach;
        // 모르는 정도 + 이 축이 걸릴 가능성.
        //
        // ⚠️ 두 번째 항(관계층)은 **효과가 확인되지 않았다.**
        //
        // 분해 실험(ablation-run.ts, 시드 3개)에서 관계층 단독의
        // 기여는 −1.9 / +8.0 / −5.7 %p 였고, 아무것도 켜지 않은
        // 조건(−2.6 / +6.8 / −8.0)과 시드 편차 안에서 구분되지
        // 않았다. 전이를 만든 것은 관계층이 아니라 확신 완화다.
        //
        // 남겨 둔 이유는 두 가지다. 유전자로 꺼져 있어 해가 없고,
        // 관계 지식이 **예측에 참여**하게 되면 (지금은 탐색 방향만
        // 바꾼다) 다시 재볼 가치가 있기 때문이다. 그때까지 이 항은
        // 가설이지 성과가 아니다.
        const score =
          this.memory.ignorance(s, flipped) +
          this.memory.couplingFor(s, axis) * this.genome.relationalWeight;
        if (score > bestScore) {
          bestScore = score;
          target = flipped;
        }
      }
      const honest = this.memory.predict(s, target);
      this.spent += 1;
      this.lastP = honest.p;
      return {
        approach: target,
        pApproved: honest.p,
        basis: `실험: ${honest.weakest}`,
        explored: true,
      };
    }

    this.lastP = exploit.pApproved;
    return exploit;
  }

  /**
   * 놀람 갱신.
   *
   * 오차를 두 속도로 평균 낸다. 빠른 쪽이 느린 쪽 위로 올라가는
   * 구간이 "최근 들어 예상이 안 맞기 시작했다"는 뜻이고, 그때
   * 호기심이 다시 켜진다.
   */
  learn(s: Situation, a: Approach, approved: boolean): void {
    const error = Math.abs(this.lastP - (approved ? 1 : 0));
    this.fastError = this.fastError * 0.9 + error * 0.1;
    this.slowError = this.slowError * 0.99 + error * 0.01;
    super.learn(s, a, approved);

    // 관계층은 값 셀에서 유도되지만 값 셀보다 오래 산다. 자주 갱신할
    // 필요는 없고, 값이 좀 쌓인 뒤에 읽는 편이 정확하다.
    if (this.episode % 50 === 0) this.memory.refreshRelational();

    // ── 세계가 바뀌었다는 판단 ──────────────────────────────────
    //
    // 놀람이 오래 크게 유지되면 낡은 값 셀이 틀렸다는 뜻이다. 값은
    // 버리고 관계는 남긴다 — "executive가 짧은 걸 원한다"는 틀렸어도
    // "독자가 분량을 건드린다"는 여전히 참일 가능성이 높다.
    //
    // 전이 진단에서 패턴 자가 -9.0%p 를 낸 것이 바로 이 처리가
    // 없었기 때문이다. 무지가 아니라 오신이 문제였다.
    if (
      this.genome.forgetOnSurprise &&
      this.surprise > 0.08 &&
      this.episode - this.lastForget > 200
    ) {
      this.memory.softenValues();
      this.lastForget = this.episode;
      // 값을 버렸으니 확신도 함께 내려놓는다. 안 그러면 다음 판단이
      // 빈 기억 위에서 옛 확신을 그대로 쓴다.
      this.fastError = 0.5;
      this.slowError = 0.5;
    }
  }

  get explorationSpent(): number {
    return this.spent;
  }

  get surprise(): number {
    return Math.max(0, this.fastError - this.slowError);
  }

  /**
   * 시험 주행용 복제본.
   *
   * 후보 세계가 얼마나 배울 거리를 주는지 재려면 실제로 돌려 봐야
   * 하는데, 본체로 돌리면 재는 행위가 대상을 바꾼다. 복제본을 보내고
   * 결과만 가져온다.
   *
   * 복제되는 것은 기억과 놀람 상태다. 세계는 복제되지 않는다 —
   * 복제본도 현실에서만 채점받는다.
   */
  clone(episodes: number): GenesisAgent {
    const copy = new GenesisAgent(episodes, this.genome);
    copy.memory.restore(this.memory.snapshot());
    copy.fastError = this.fastError;
    copy.slowError = this.slowError;
    copy.lastP = this.lastP;
    copy.episode = this.episode;
    copy.spent = this.spent;
    return copy;
  }
}
