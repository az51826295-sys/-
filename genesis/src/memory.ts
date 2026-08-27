import { BASE_GENOME } from "./genome.ts";
import { APPROACH_AXES } from "./types.ts";
import type { Genome } from "./genome.ts";
import type { Approach, Situation } from "./types.ts";

/**
 * 의미 기억 — 경험에서 뽑아낸 조건부 규칙.
 *
 * 개별 사건을 다시 읽는 게 아니라, "이 조건에서 이 선택을 하면
 * 승인되는가"를 셀 단위로 누적한다. 셀 하나가 규칙 하나의 후보다.
 *
 * 셀에는 신뢰도(=근거 수)가 붙는다. 근거가 적은 셀은 강하게 사전값
 * 쪽으로 당겨진다. 한 번 겪은 것을 진리로 믿지 않기 위해서다.
 *
 * 정책 값은 전부 유전자에서 온다. 진화 엔진이 바꿀 수 있는 것들이다.
 */

type Cell = {
  ok: number;
  n: number;
  observed: number;
};

type Feature = "kind" | "audience" | "urgency";

const FEATURES: Feature[] = ["kind", "audience", "urgency"];

const FEATURE_VALUES: Record<Feature, readonly string[]> = {
  kind: ["research", "outreach", "summary"],
  audience: ["executive", "team", "client"],
  urgency: ["low", "high"],
};

function singleKeys(s: Situation): string[] {
  return [`kind=${s.kind}`, `audience=${s.audience}`, `urgency=${s.urgency}`];
}

/**
 * 쌍 맥락 키.
 *
 * "요약이면서 동시에 급할 때"처럼 두 조건이 겹칠 때만 성립하는
 * 법칙은 단일 키로는 표현할 수 없다. 단일 키만 쓰면 그 법칙은
 * 두 개의 흐릿한 규칙으로 번져 나가고, 결국 과잉일반화가 된다.
 */
function pairKeys(s: Situation): string[] {
  const one = singleKeys(s);
  const out: string[] = [];
  for (let i = 0; i < one.length; i++) {
    for (let j = i + 1; j < one.length; j++) {
      out.push(`${one[i]}&${one[j]}`);
    }
  }
  return out;
}

export class SemanticMemory {
  private cells = new Map<string, Cell>();
  private readonly g: Genome;

  constructor(genome: Genome = BASE_GENOME) {
    this.g = genome;
  }

  private contextKeys(s: Situation): string[] {
    return this.g.pairContexts
      ? [...singleKeys(s), ...pairKeys(s)]
      : singleKeys(s);
  }

  private cellKeys(s: Situation, a: Approach): string[] {
    const keys: string[] = [];
    for (const ctx of this.contextKeys(s)) {
      for (const axis of Object.keys(APPROACH_AXES) as (keyof Approach)[]) {
        keys.push(`${ctx} :: ${axis}=${a[axis]}`);
      }
    }
    return keys;
  }

  private estimate(key: string): number {
    const c = this.cells.get(key);
    if (!c) return this.g.prior;
    return (
      (c.ok + this.g.prior * this.g.priorWeight) / (c.n + this.g.priorWeight)
    );
  }

  /** 근거가 적을수록 1에 가깝다. 호기심이 향할 곳을 고르는 값. */
  private uncertainty(key: string): number {
    const c = this.cells.get(key);
    const n = c ? c.n : 0;
    return this.g.priorWeight / (n + this.g.priorWeight);
  }

  /**
   * 승인 확률 예측.
   *
   * 승인은 모든 제약을 동시에 만족해야 나온다 — 하나라도 어기면
   * 끝이다. 그래서 예측은 가장 약한 고리가 결정한다. 평균이 아니라
   * 최솟값을 쓰는 이유다.
   */
  predict(s: Situation, a: Approach): { p: number; weakest: string } {
    let p = 1;
    let weakest = "";
    for (const key of this.cellKeys(s, a)) {
      const e = this.estimate(key);
      if (e < p) {
        p = e;
        weakest = key;
      }
    }
    return { p: Math.min(0.97, Math.max(0.02, p)), weakest };
  }

  /** 이 선택에 대해 내가 얼마나 모르는가. Unknown Map 의 최소 구현. */
  ignorance(s: Situation, a: Approach): number {
    let total = 0;
    for (const key of this.cellKeys(s, a)) total += this.uncertainty(key);
    return total;
  }

  learn(s: Situation, a: Approach, approved: boolean): void {
    for (const key of this.cellKeys(s, a)) {
      let c = this.cells.get(key);
      if (!c) {
        c = { ok: 0, n: 0, observed: 0 };
        this.cells.set(key, c);
      }
      c.ok = c.ok * this.g.decay + (approved ? 1 : 0);
      c.n = c.n * this.g.decay + 1;
      c.observed += 1;
    }
  }

  /**
   * 안정된 금지 규칙만 뽑는다.
   *
   * 근거가 충분하고, 승인 확률이 뚜렷하게 낮은 셀. 이게 AI가
   * 세상에서 발견해낸 법칙이다.
   */
  discoveredProhibitions(minObserved = 20, maxRate = 0.25) {
    const out: { rule: string; rate: number; observed: number }[] = [];
    for (const [key, c] of this.cells) {
      if (c.observed < minObserved) continue;
      const rate = this.estimate(key);
      if (rate <= maxRate) out.push({ rule: key, rate, observed: c.observed });
    }
    return out.sort((x, y) => x.rate - y.rate);
  }

  /**
   * 모순 큐 (Phase 4, 3.3절).
   *
   * 같은 조건에서 같은 선택을 했는데 결과가 갈리는 셀. 근거는
   * 충분한데 승인률이 중간에 머물러 있다는 건, 이 셀만으로는
   * 설명되지 않는 숨은 조건이 있다는 뜻이다.
   *
   * 원인은 둘 중 하나이고, 둘을 구분하는 것이 이 큐의 존재 이유다.
   *
   *   · 학습 가능 — 아직 안 보이는 조건이 있다 (상호작용 법칙).
   *     쌍 맥락을 켜면 설명된다.
   *   · 학습 불가능 — 그냥 환경 잡음. 여기 파고들면 노이즈 TV.
   *
   * 우선순위는 Existence Drive와 같은 기준이다: 자주 등장하고
   * (해소하면 예측력이 많이 오르고), 갈림이 심한 것부터.
   */
  contradictions(minObserved = 30, band: [number, number] = [0.3, 0.7]) {
    const out: { cell: string; rate: number; observed: number; priority: number }[] = [];
    for (const [cellKey, c] of this.cells) {
      if (c.observed < minObserved) continue;
      const rate = this.estimate(cellKey);
      if (rate < band[0] || rate > band[1]) continue;
      // 0.5에 가까울수록 갈림이 심하고, 자주 볼수록 값이 크다.
      const split = 1 - Math.abs(rate - 0.5) * 2;
      out.push({ cell: cellKey, rate, observed: c.observed, priority: split * Math.log(c.observed) });
    }
    return out.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 모름의 지도 (Phase 4, 4절).
   *
   * 근거가 가장 적은 셀들. 호기심이 다음에 향할 곳이다.
   * 여기 상한이 없으면 탐색은 방향을 잃는다.
   */
  unknownMap(limit = 8) {
    const out: { cell: string; observed: number; uncertainty: number }[] = [];
    for (const [cellKey, c] of this.cells) {
      out.push({ cell: cellKey, observed: c.observed, uncertainty: this.uncertainty(cellKey) });
    }
    return out.sort((a, b) => b.uncertainty - a.uncertainty).slice(0, limit);
  }

  // ── 관계층 ────────────────────────────────────────────────────
  //
  // 값에 붙은 기억(`audience=executive :: length=short`)은 세계가
  // 바뀌면 틀린 값을 확신을 갖고 주장한다. 전이 진단에서 패턴 자가
  // -9.0%p 를 낸 이유가 이것이었다 — 무지가 아니라 오신이다.
  //
  // 그런데 값이 달라져도 **어떤 특징이 어떤 축을 건드리는가**는 남는다.
  // "독자가 분량을 제한한다"는 executive 든 client 든 참이다.
  //
  // ⚠️ 다만 이 층이 실제로 값을 한다는 증거는 아직 없다. 분해 실험에서
  // 관계층 단독 효과는 시드 편차 안에 묻혔다. 지금 이 지식은 탐색
  // 방향만 바꾸고 **예측에는 참여하지 않는데**, 그게 이유일 가능성이
  // 높다. 예측에 참여시키려면 "독자가 분량을 제약한다, 값은 미정"을
  // 일급 믿음으로 표현할 수 있어야 하고, 그건 더 큰 변경이다.
  private relational = new Map<string, number>();

  private static pairKey(feature: string, axis: string): string {
    return `${feature}~${axis}`;
  }

  /**
   * 결합도 — 이 특징이 이 축을 실제로 제약하는가.
   *
   * 특징값을 고정했을 때 축의 두 값이 승인률에서 얼마나 갈리는지 본다.
   * 제약이 있으면 한쪽은 바닥, 다른 쪽은 천장이라 차이가 크다.
   * 무관하면 둘이 비슷하다.
   */
  private measureCoupling(feature: Feature, axis: keyof Approach): number {
    const values = FEATURE_VALUES[feature];
    const options = APPROACH_AXES[axis] as readonly string[];
    let total = 0;
    let counted = 0;

    for (const fv of values) {
      const estimates = options.map((av) => {
        const key = `${feature}=${fv} :: ${axis}=${av}`;
        const c = this.cells.get(key);
        // 근거가 없는 셀은 결합도 판단에 넣지 않는다. 사전값끼리
        // 비교하면 언제나 차이 0이 나와 "무관"으로 오판한다.
        return c && c.n >= 3 ? this.estimate(key) : null;
      });
      const known = estimates.filter((e): e is number => e !== null);
      if (known.length < options.length) continue;
      total += Math.max(...known) - Math.min(...known);
      counted += 1;
    }

    return counted === 0 ? 0 : total / counted;
  }

  /** 관계층 갱신. 값 셀에서 유도되지만 값 셀과 수명이 다르다. */
  refreshRelational(): void {
    for (const feature of FEATURES) {
      for (const axis of Object.keys(APPROACH_AXES) as (keyof Approach)[]) {
        const key = SemanticMemory.pairKey(feature, axis);
        const observed = this.measureCoupling(feature, axis);
        if (observed === 0) continue;
        const prior = this.relational.get(key) ?? 0;
        // 천천히 쌓는다. 한 세계에서 본 것이 관계 지식의 전부가
        // 되면 그것도 결국 값에 붙은 기억과 같아진다.
        this.relational.set(key, prior * 0.85 + observed * 0.15);
      }
    }
  }

  /** 이 상황에서 이 축이 걸릴 가능성. 새 세계에서 어디를 볼지 정한다. */
  couplingFor(s: Situation, axis: keyof Approach): number {
    let best = 0;
    for (const feature of FEATURES) {
      const v = this.relational.get(SemanticMemory.pairKey(feature, axis)) ?? 0;
      if (v > best) best = v;
    }
    void s;
    return best;
  }

  /**
   * 확신만 낮춘다. 내용은 버리지 않는다.
   *
   * 첫 구현은 값 셀을 통째로 지웠다(`clear()`). 패턴 자의 해악
   * -9.0%p 는 사라졌지만 공유 자의 이득 +7.2%p 도 같이 사라졌다 —
   * **독과 약을 함께 버린 것이다.**
   *
   * 놀람은 "내 값이 틀렸다"와 "세계가 새롭다"를 구분하지 못한다.
   * 그러니 무엇이 틀렸는지 모르는 상태에서 전부 지우면 안 된다.
   *
   * 대신 비율은 남기고 근거 수만 줄인다. 그러면
   *   · 틀린 셀 — 확신이 낮아져 사전값에 끌려가고, 새 증거로 빨리 교정된다
   *   · 맞은 셀 — 비율이 그대로라 여전히 옳은 방향을 가리키고,
   *              다음 관측 몇 번이면 확신을 되찾는다
   *
   * 무엇이 틀렸는지는 현실이 알려준다. 우리는 귀를 열어 두기만 하면 된다.
   */
  softenValues(keep = 0.25): void {
    for (const c of this.cells.values()) {
      c.ok *= keep;
      c.n *= keep;
    }
  }

  get relationalSize(): number {
    return this.relational.size;
  }

  /**
   * 기억 스냅샷.
   *
   * 후보 세계를 시험할 때 본체를 보내면, 시험 자체가 본체의 기억을
   * 바꾼다 — 어느 세계가 좋았는지 재려다가 재는 대상을 망가뜨리는
   * 것이다. 그래서 복제본을 보낸다.
   */
  snapshot(): { cells: [string, Cell][]; relational: [string, number][] } {
    return {
      cells: [...this.cells].map(([k, c]) => [k, { ...c }]),
      relational: [...this.relational],
    };
  }

  restore(snap: { cells: [string, Cell][]; relational: [string, number][] }): void {
    this.cells = new Map(snap.cells.map(([k, c]) => [k, { ...c }]));
    this.relational = new Map(snap.relational);
  }

  get size(): number {
    return this.cells.size;
  }
}
