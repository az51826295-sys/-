import type { Supabase } from "@/lib/execution/shared";
import {
  BASE_GENOME,
  candidatesFrom,
  describeGene,
  type Candidate,
  type PredictionGenome,
} from "@/lib/genesis/genome";

/**
 * 예측 규칙의 자기진화 — 시뮬레이터에 있던 고리의 세 번째 칸.
 *
 * 지금까지 로키는 예측을 적고(① 잠금) 매니저 판정과 대조해 오차를 냈지만(②),
 * **그 오차로 아무것도 바꾸지 않았다.** 재기만 하는 고리는 회고지 학습이 아니다.
 *
 * 여기서 바꾸는 것은 규칙의 값들이다(`genome.ts`). 바꾸는 방법은 **재생**이다:
 * 이 회사가 실제로 내린 판정 기록을 그대로 다시 돌려, "이 유전자였다면 그때
 * 무엇을 예측했겠는가"를 계산하고 Brier 점수를 비교한다.
 *
 * ## 헌법이 여기서 무엇을 막는가
 *
 * - **SANDBOX_ONLY_EVOLUTION** — 후보는 기록 위에서만 평가된다. 살아 있는
 *   회사의 행동을 바꿔 놓고 결과를 보지 않는다. 사람에게 실험하지 않는다.
 * - **ONE_GENE_PER_EXPERIMENT** — 후보마다 유전자 하나만 다르다. 그래야
 *   좋아졌을 때 무엇 덕분인지 말할 수 있다.
 * - **MIN_EVALUATION_SEEDS** — 여러 조각으로 나눠 검증하고, 조각 하나에서만
 *   이긴 것은 과적합으로 본다.
 * - **MAX_REGRESSION** — 목표 지표가 좋아져도 다른 능력이 이만큼 나빠지면 탈락.
 *
 * ## 데이터가 없으면 아무것도 하지 않는다
 *
 * 판정 기록이 얇으면 어떤 유전자든 우연히 이긴다. 그때는 채택하지 않고
 * **부족하다고 말한다.** 이건 실패가 아니라 미측정이고, 미측정을 승리로
 * 세는 것이 이 종류의 엔진이 스스로를 속이는 가장 흔한 방법이다.
 */

/** 이보다 적으면 진화를 시도조차 하지 않는다. */
export const MIN_DECIDED = 40;
/** 기록을 몇 조각으로 나눠 검증하는가. 헌법의 MIN_EVALUATION_SEEDS 와 같다. */
export const FOLDS = 5;
/** 이만큼은 나아져야 채택한다. 노이즈와 구별되지 않는 개선은 개선이 아니다. */
export const MIN_GAIN = 0.005;
/** 목표가 좋아져도 최악의 조각이 이만큼 나빠지면 탈락. */
export const MAX_REGRESSION = 0.02;

type Row = {
  approved: number;
  features: string[];
  committedAt: string;
};

export type EvolveOutcome =
  | {
      kind: "adopted";
      genome: PredictionGenome;
      gene: string;
      baseBrier: number;
      newBrier: number;
      gain: number;
      folds: number;
      decided: number;
    }
  | {
      kind: "kept";
      why: string;
      baseBrier: number;
      bestGain: number | null;
      decided: number;
    }
  | { kind: "insufficient"; decided: number; needed: number };

/** 판정이 끝난 예측 기록. 진화의 유일한 원료다. */
async function history(db: Supabase, companyId: string): Promise<Row[]> {
  const { data } = await db
    .from("work_prediction_scores")
    .select("approved, basis, committed_at")
    .eq("company_id", companyId)
    .order("committed_at", { ascending: true });

  return ((data ?? []) as { approved: number; basis: { features?: string[] } | null; committed_at: string }[])
    .map((r) => ({
      approved: r.approved,
      features: r.basis?.features ?? [],
      committedAt: r.committed_at,
    }))
    .filter((r) => r.features.length > 0);
}

/**
 * 한 유전자로 기록을 재생해 Brier 를 낸다.
 *
 * 각 행을 예측할 때 **그 행보다 앞선 것만** 근거로 쓴다. 뒤엣것을 쓰면 미래를
 * 보고 예측하는 셈이고, 그렇게 나온 점수는 언제나 좋아 보인다.
 */
function replay(rows: Row[], g: PredictionGenome, evalFrom: number): number {
  let sum = 0;
  let n = 0;

  for (let i = evalFrom; i < rows.length; i++) {
    const cells = new Map<string, { ok: number; n: number }>();
    // i 이전만, 가까운 것부터 무게를 준다.
    for (let j = i - 1; j >= 0; j--) {
      const weight = Math.pow(g.recency, i - 1 - j);
      for (const key of rows[j].features) {
        const c = cells.get(key) ?? { ok: 0, n: 0 };
        c.n += weight;
        if (rows[j].approved === 1) c.ok += weight;
        cells.set(key, c);
      }
    }

    // 승인은 모든 조건을 만족해야 나온다 — 가장 약한 고리가 확률을 정한다.
    let p = 1;
    for (const key of rows[i].features) {
      const c = cells.get(key);
      const estimate =
        ((c?.ok ?? 0) + g.prior * g.priorWeight) / ((c?.n ?? 0) + g.priorWeight);
      if (estimate < p) p = estimate;
    }
    p = Math.min(g.ceiling, Math.max(g.floor, p));

    sum += Math.pow(p - rows[i].approved, 2);
    n++;
  }

  return n === 0 ? Number.NaN : sum / n;
}

/** 기록을 앞에서부터 늘려 가며 조각낸다. 시간 순서를 깨지 않는다. */
function foldStarts(total: number): number[] {
  const first = Math.floor(total / (FOLDS + 1));
  return Array.from({ length: FOLDS }, (_, k) => first * (k + 1));
}

export async function evolvePrediction(
  db: Supabase,
  companyId: string,
  base: PredictionGenome = BASE_GENOME,
): Promise<EvolveOutcome> {
  const rows = await history(db, companyId);
  if (rows.length < MIN_DECIDED) {
    return { kind: "insufficient", decided: rows.length, needed: MIN_DECIDED };
  }

  const starts = foldStarts(rows.length);
  const scoreOf = (g: PredictionGenome) => starts.map((s) => replay(rows, g, s));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const baseScores = scoreOf(base);
  const baseBrier = mean(baseScores);

  let best: { c: Candidate; brier: number; gain: number } | null = null;

  for (const c of candidatesFrom(base)) {
    const scores = scoreOf(c.genome);
    if (scores.some((s) => Number.isNaN(s))) continue;

    // 조각마다 이겼는지 본다. 하나에서만 이긴 것은 과적합이다.
    const wins = scores.filter((s, i) => s < baseScores[i]).length;
    if (wins < FOLDS) continue;

    // 목표가 좋아져도 어느 한 조각이 크게 나빠지면 탈락시킨다.
    const worstRegression = Math.max(
      ...scores.map((s, i) => s - baseScores[i]),
    );
    if (worstRegression > MAX_REGRESSION) continue;

    const brier = mean(scores);
    const gain = baseBrier - brier;
    if (!best || gain > best.gain) best = { c, brier, gain };
  }

  if (!best || best.gain < MIN_GAIN) {
    return {
      kind: "kept",
      why: best
        ? `가장 좋은 후보(${describeGene(best.c)})도 개선이 ${best.gain.toFixed(
            4,
          )} 로 문턱 ${MIN_GAIN} 아래다. 노이즈와 구별되지 않는다.`
        : "모든 조각에서 이긴 후보가 없다.",
      baseBrier,
      bestGain: best?.gain ?? null,
      decided: rows.length,
    };
  }

  return {
    kind: "adopted",
    genome: best.c.genome,
    gene: describeGene(best.c),
    baseBrier,
    newBrier: best.brier,
    gain: best.gain,
    folds: FOLDS,
    decided: rows.length,
  };
}
