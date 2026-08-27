import { brierOf } from "./metrics.ts";
import { makeRng, pick } from "./rng.ts";
import { simulate } from "./simulate.ts";
import { generateWorld } from "./worldgen.ts";
import type { GenesisAgent } from "./agents.ts";
import type { WorldGenome } from "./worldgen.ts";
import type { WorldSpec } from "./world.ts";

/**
 * 세계 진화 — 커리큘럼 생성기 (Phase 4, 17절).
 *
 * 에이전트가 세계를 다 배우면 LP가 0으로 수렴한다. Existence Drive는
 * "LP가 0이면 다른 데로 가라"고 말하는데, 세계가 하나뿐이면 갈 데가
 * 없다. 그 자리를 채우는 것이 이 파일이다.
 *
 * ── 함정과 그 해법 ────────────────────────────────────────────────
 *
 * 같은 최적화기가 세계와 에이전트를 둘 다 쥐면, 세계는 에이전트가
 * 잘하도록 진화한다. 성적이 오르고, 그래프가 예뻐지고, 아무것도
 * 배우지 않는다. 자기 채점 문제가 자리만 바꿔서 다시 나타난다.
 *
 * 그래서 세계의 적합도를 **성공률이 아니라 LP**로 잡는다.
 *
 *   너무 쉬운 세계   → 이미 다 맞힘  → 오차가 안 줄어듦 → LP 0 → 탈락
 *   너무 어려운 세계 → 아무것도 못 맞힘 → 역시 안 줄어듦 → LP 0 → 탈락
 *   딱 배울 만한 세계 → 오차가 빠르게 줄어듦          → LP 최대 → 채택
 *
 * 쉬운 세계와 불가능한 세계가 같은 값으로 배제된다. 에이전트의
 * Existence Drive와 정확히 같은 수식이고, 방향만 반대다.
 *
 * ── 절대 하지 않는 것 ─────────────────────────────────────────────
 *
 * 이 파일은 고정 벤치마크를 **읽지 않는다.** 커리큘럼이 자를 보고
 * 세계를 고르기 시작하면 자가 훈련 신호가 되고, 그 순간 "나아졌다"를
 * 확인할 방법이 사라진다.
 */

export type Stage = {
  index: number;
  genome: WorldGenome;
  spec: WorldSpec;
  seed: number;
  /** 적합도 = LP × 남은 여지. 선택 기준. */
  fitness: number;
  /** 이 세계가 만들어낸 학습 진행률. */
  lp: number;
  /** 실제 훈련 후의 승인률. 선택 기준이 아니라 기록용. */
  approvalAfter: number;
  fromArchive: boolean;
};

const GENOME_BOUNDS = {
  lawCount: [2, 9] as const,
  interactionRatio: [0, 1] as const,
  noise: [0.02, 0.2] as const,
  regimeAt: [0, 2000] as const,
};

function clamp(x: number, [lo, hi]: readonly [number, number]): number {
  return Math.min(hi, Math.max(lo, x));
}

/** 유전자 하나만 흔든다. 여러 개를 동시에 바꾸면 무엇 덕분인지 모른다. */
export function mutateWorld(g: WorldGenome, rng: () => number): WorldGenome {
  const gene = pick(rng, ["lawCount", "interactionRatio", "noise", "regimeAt"] as const);
  const next = { ...g };
  switch (gene) {
    case "lawCount":
      next.lawCount = Math.round(clamp(g.lawCount + (rng() < 0.5 ? -1 : 1), GENOME_BOUNDS.lawCount));
      break;
    case "interactionRatio":
      next.interactionRatio = clamp(
        g.interactionRatio + (rng() - 0.5) * 0.6,
        GENOME_BOUNDS.interactionRatio,
      );
      break;
    case "noise":
      next.noise = clamp(g.noise + (rng() - 0.5) * 0.08, GENOME_BOUNDS.noise);
      break;
    case "regimeAt":
      next.regimeAt = rng() < 0.4 ? 0 : Math.round(clamp(200 + rng() * 1200, GENOME_BOUNDS.regimeAt));
      break;
  }
  return next;
}

/**
 * 시험 주행 — 이 세계가 배울 거리를 주는가.
 *
 * 본체가 아니라 복제본을 보낸다. 재는 행위가 대상을 바꾸면 안 된다.
 * LP는 오차의 크기가 아니라 **하강 속도**다.
 */
export function probeLearningProgress(
  agent: GenesisAgent,
  spec: WorldSpec,
  seed: number,
  episodes: number,
): { fitness: number; lp: number; headroom: number } {
  const probe = agent.clone(episodes);
  const { experiences } = simulate(() => probe, { episodes, seed, spec });
  const half = Math.floor(experiences.length / 2);
  const before = brierOf(experiences.slice(0, half));
  const after = brierOf(experiences.slice(half));
  const lp = ((before - after) / episodes) * 1000;

  // ── 왜 LP만으로는 부족한가 ──────────────────────────────────────
  //
  // 첫 구현은 적합도를 LP 하나로 뒀고, 커리큘럼은 법칙 수를 3에서
  // 2로 줄인 뒤 거기 머물렀다. 쉬운 세계로 도망친 것이다.
  //
  // 원인은 LP가 잰 것이 "깊이 배웠다"가 아니라 "빨리 적응했다"였기
  // 때문이다. 세계를 옮기면 어디로 가든 적응 전이가 생기고 오차가
  // 잠깐 급락한다. 그리고 그 전이는 **쉬운 세계일수록 깨끗하다.**
  // 적합도가 난이도를 낮추는 쪽을 보상하고 있었다.
  //
  // 그래서 남은 여지를 곱한다. 이미 천장에 붙은 세계는 아무리
  // 전이가 예뻐도 배울 것이 없으므로 0이 된다.
  const tail = experiences.slice(half);
  const approval =
    tail.filter((e) => e.outcome.verdict === "approved").length / tail.length;
  const headroom = Math.max(0, 1 - spec.noise - approval);

  return { fitness: lp * headroom, lp, headroom };
}

export type CurriculumOptions = {
  stages: number;
  /** 한 단계에서 실제로 훈련하는 에피소드 수. */
  stageEpisodes: number;
  /** 후보를 재는 시험 주행 길이. 짧을수록 싸지만 잡음이 는다. */
  probeEpisodes: number;
  /** 단계마다 만들어 볼 돌연변이 수. */
  candidates: number;
  seed: number;
};

/**
 * 커리큘럼을 돌린다.
 *
 * 단계마다: 후보 세계를 만들고 → 복제본으로 LP를 재고 → 가장 많이
 * 배울 수 있는 세계를 골라 → 본체를 거기서 훈련시킨다.
 *
 * 학습을 만들어낸 세계는 아카이브에 남긴다. 나중에 에이전트가 자란
 * 뒤 다시 꺼내면 그때는 다른 난이도가 되어 있다.
 */
export function runCurriculum(
  agent: GenesisAgent,
  o: CurriculumOptions,
): { stages: Stage[]; archive: { genome: WorldGenome; seed: number }[] } {
  const rng = makeRng(o.seed);
  const stages: Stage[] = [];
  const archive: { genome: WorldGenome; seed: number }[] = [];

  let current: WorldGenome = {
    lawCount: 3,
    interactionRatio: 0.2,
    noise: 0.08,
    regimeAt: 0,
  };

  for (let i = 1; i <= o.stages; i++) {
    type Candidate = { genome: WorldGenome; seed: number; fromArchive: boolean };
    const pool: Candidate[] = [{ genome: current, seed: 5000 + i * 31, fromArchive: false }];

    for (let c = 0; c < o.candidates; c++) {
      pool.push({
        genome: mutateWorld(current, rng),
        seed: 5000 + i * 31 + c * 7,
        fromArchive: false,
      });
    }
    // 아카이브에서 하나. 예전에 배울 거리를 줬던 세계는 에이전트가
    // 자란 지금 다른 난이도가 되어 있다.
    if (archive.length > 0 && rng() < 0.5) {
      const old = pick(rng, archive);
      pool.push({ genome: old.genome, seed: old.seed, fromArchive: true });
    }

    let best: Candidate | null = null;
    let bestFitness = -Infinity;
    let bestLp = 0;
    let bestSpec: WorldSpec | null = null;

    for (const cand of pool) {
      const spec = generateWorld(cand.genome, cand.seed);
      const probe = probeLearningProgress(agent, spec, cand.seed, o.probeEpisodes);
      if (probe.fitness > bestFitness) {
        bestFitness = probe.fitness;
        bestLp = probe.lp;
        best = cand;
        bestSpec = spec;
      }
    }

    if (!best || !bestSpec) break;

    // 고른 세계에서 본체를 실제로 훈련시킨다.
    const { experiences } = simulate(() => agent, {
      episodes: o.stageEpisodes,
      seed: best.seed,
      spec: bestSpec,
    });
    const tail = experiences.slice(-Math.floor(o.stageEpisodes / 2));
    const approvalAfter =
      tail.filter((e) => e.outcome.verdict === "approved").length / tail.length;

    stages.push({
      index: i,
      genome: best.genome,
      spec: bestSpec,
      seed: best.seed,
      fitness: bestFitness,
      lp: bestLp,
      approvalAfter,
      fromArchive: best.fromArchive,
    });

    // 배울 거리를 준 세계만 남긴다.
    if (bestFitness > 0 && !best.fromArchive) {
      archive.push({ genome: best.genome, seed: best.seed });
    }
    current = best.genome;
  }

  return { stages, archive };
}
