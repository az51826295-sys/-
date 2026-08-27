import { CLASSIC_LAWS, flipNamed, holds, satisfied } from "./laws.ts";
import { makeRng, pick } from "./rng.ts";
import type { Law } from "./laws.ts";
import type { Approach, Situation, Verdict } from "./types.ts";

/**
 * 세상 v0.3.
 *
 * 여기에는 LLM이 없다. 세상은 법칙이지 지능이 아니다. 그래서 이
 * 시뮬레이션은 몇 십만 회를 돌려도 비용이 0이고, 시드만 같으면
 * 언제나 똑같이 재현된다.
 *
 * v0.3에서 달라진 것: 법칙이 이 파일에 박혀 있지 않다. 데이터로
 * 주입받는다. 그래야 세계 생성기가 우리가 손으로 쓴 적 없는 법칙을
 * 조합해 만들 수 있다 — 세계 자체를 진화시키기 위한 전제다.
 *
 * 기본값은 v0.2까지의 다섯 법칙 그대로다. 문법을 바꾸면서 세계까지
 * 바뀌면 리팩터가 성공했는지 알 수 없다.
 */

export const DEFAULT_NOISE = 0.08;

/** 기본 세계에서 도중에 뒤집히는 법칙. */
const CLASSIC_FLIP_TARGET = "client_wants_formal";

export type WorldSpec = {
  laws: Law[];
  /**
   * 환경 불확실성. 아무 잘못이 없어도 이 비율은 수정 요청이 온다.
   *
   * 이 항이 가장 중요한 장치다. 이것 때문에 예측 오차는 절대 0이
   * 되지 않는다. 잘 만든 에이전트라면 여기서 학습을 멈춰야 한다 —
   * 더 배워도 줄지 않는 오차에 계속 비용을 쓰는 것이 노이즈 TV
   * 함정이다.
   */
  noise: number;
  /** 이 에피소드에서 법칙 하나가 뒤집힌다. 0이면 고정. */
  regimeAt: number;
  /** 뒤집을 법칙 이름. 없으면 첫 번째 법칙. */
  flipTarget?: string;
};

export function classicSpec(regimeAt = 0): WorldSpec {
  return {
    laws: CLASSIC_LAWS,
    noise: DEFAULT_NOISE,
    regimeAt,
    flipTarget: CLASSIC_FLIP_TARGET,
  };
}

export class World {
  /**
   * 난수를 둘로 나눈 이유: 상황 생성과 잡음이 같은 스트림을 쓰면,
   * 에이전트가 다르게 행동하는 순간 이후의 상황 순서가 갈라진다.
   * 그러면 두 에이전트의 성적 차이가 실력인지 운인지 알 수 없다.
   */
  private situationRng: () => number;
  private noiseRng: () => number;
  private tick = 0;
  private readonly spec: WorldSpec;
  private readonly lateLaws: Law[];

  constructor(seed: number, regimeAtOrSpec: number | WorldSpec = 0) {
    this.situationRng = makeRng(seed);
    this.noiseRng = makeRng(seed ^ 0x9e3779b9);
    this.spec =
      typeof regimeAtOrSpec === "number"
        ? classicSpec(regimeAtOrSpec)
        : regimeAtOrSpec;

    const target = this.spec.flipTarget ?? this.spec.laws[0]?.name ?? "";
    this.lateLaws = flipNamed(this.spec.laws, target);
  }

  private get laws(): Law[] {
    if (this.spec.regimeAt > 0 && this.tick > this.spec.regimeAt) {
      return this.lateLaws;
    }
    return this.spec.laws;
  }

  nextSituation(): Situation {
    this.tick += 1;
    return {
      kind: pick(this.situationRng, ["research", "outreach", "summary"] as const),
      audience: pick(this.situationRng, ["executive", "team", "client"] as const),
      urgency: pick(this.situationRng, ["low", "high"] as const),
    };
  }

  /** 심사. 에이전트는 verdict 만 받고 violations 는 못 본다. */
  judge(s: Situation, a: Approach): { verdict: Verdict; violations: string[] } {
    const violations = this.laws.filter(
      (l) => holds(l.when, s) && !satisfied(l.require, a),
    );

    // 잡음 추첨은 위반 여부와 무관하게 항상 소비한다. 그래야 난수
    // 스트림이 행동에 따라 어긋나지 않는다.
    const unlucky = this.noiseRng() < this.spec.noise;

    if (violations.some((l) => l.penalty === "rejected")) {
      return { verdict: "rejected", violations: violations.map((l) => l.name) };
    }
    if (violations.length > 0) {
      return { verdict: "revision", violations: violations.map((l) => l.name) };
    }
    if (unlucky) {
      return { verdict: "revision", violations: ["__noise__"] };
    }
    return { verdict: "approved", violations: [] };
  }

  /** 이 세계에서 이론상 도달 가능한 최대 승인률. */
  get ceiling(): number {
    return 1 - this.spec.noise;
  }

  get lawCount(): number {
    return this.spec.laws.length;
  }

  /** 기본 세계의 천장. 리포트 헤더용. */
  static get ceiling(): number {
    return 1 - DEFAULT_NOISE;
  }

  static get lawCount(): number {
    return CLASSIC_LAWS.length;
  }
}
