import type { Supabase } from "@/lib/execution/shared";
import { candidatesFrom, describeGene, type Candidate, type PredictionGenome } from "@/lib/genesis/genome";
import { genomeFor, scoreKeys, LOOKBACK, type ScoredRow } from "@/lib/genesis/predict";
import { machineScoredRows } from "@/lib/genesis/machineScores";

/**
 * 진화 — 예측 유전자를 실제 판정으로 시험하고, 이긴 것만 채택한다.
 *
 * 지금까지(08-27) 있던 것: 예측을 커밋하고(`predict.ts`), 유전자
 * 후보를 만드는 것(`genome.ts`)까지였다. **아무도 후보를 시험해서
 * 채택하지 않았다** — `prediction_genomes` 표에 쓰는 코드가 없었다.
 * 이 파일이 그 마지막 조각이다.
 *
 * 116회차 09-15: **떼어 둔 자료로 한 번 더 본다.** 115회차의 첫 채택은 후보를 고른 자료와 점수를 잰 자료가 같았다 —
 * 시간순 뒷걸음이라 미래를 베끼진 않지만, 14개 후보 중 제일 잘 나온 것을 고르는 것 자체가 그 자료에 맞추는 일이다.
 * 이제 앞 75%로 후보를 고르고, **고르는 데 쓰지 않은 뒤 25%**에서 기준보다 나은지 확인해야 채택한다. 규칙 고리가
 * 보류 사례로 하는 것과 같은 규율이다(`ruleLoop.ts`).
 *
 * 헌법(ONE_GENE_PER_EXPERIMENT): 한 실험은 유전자 하나만 바꾼다.
 * `candidatesFrom` 이 이미 그렇게 만들어 준다 — 여기서는 그 후보들을
 * 전부 뒷걸음(backtest)해서 가장 잘한 것 하나만 본다.
 *
 * 자기 채점이 아니다: 결과(`approved`)는 이 파일이 만들지 않는다. **사람 판정**은
 * `deliverable_reviews` → `work_prediction_scores` 뷰에서, **기계 판정**은 결과물의 자동 검사와
 * 유니티 검사에서 온다(`machineScores.ts`). 어느 쪽도 여기서 만들거나 고치지 않는다.
 *
 * 115회차 09-15: 채점 재료를 둘로 나눴다. 08-27부터 진화가 한 번도 못 돈 이유가 "판정 0건" 이었는데,
 * 그건 사람 판정만 세었기 때문이다(기계 판정은 이미 111건이 예측과 이어져 있었다). `source: "auto"` 는
 * 사람 판정이 문턱을 넘으면 사람 쪽, 아니면 기계 쪽으로 채점한다 — **사람이 판정하기 시작하면 그쪽이 이긴다.**
 * 유전자(prior·최근 가중치·바닥/천장)는 "과거에서 비율을 추정하는 법" 이라 판정 종류가 달라도 옮겨 간다.
 */

/** 표본이 이보다 적으면 시험하지 않는다. 사장님 리뷰 문서: "표본이 수천 건이
 *  아니라 수십 건 규모" — 그 범위 안에서 고른 값이다(더 정교한 값은 실제
 *  판정이 쌓인 뒤 다시 재야 한다). */
export const MIN_DECIDED = 40;

/** Brier 는 0(완벽)~1(최악). 이보다 적게 이기면 채택하지 않는다 — 우연에
 *  채택 로그를 낭비하지 않는다. */
export const MIN_IMPROVEMENT = 0.01;

/** 처음 이만큼은 역사가 얕아 시험 대상에서 뺀다(§9 프로토콜의 "성숙 구간"). */
const WARMUP_FOLDS = 3;

/** 뒤 이만큼은 후보를 고르는 데 **안 쓴다** — 고른 뒤 확인용(116회차). */
const HOLDOUT_SHARE = 0.25;
/** 떼어 둔 자료에서는 "나빠지지만 않으면" 통과. 표본이 수십 건이라 여기서까지 큰 개선을 요구하면 아무것도 못 채택한다. */
const HOLDOUT_MIN = 0;

/** 무엇으로 채점하나. `human` 사람 판정(매니저 승인) · `machine` 기계 판정(자동 검사·유니티) · `auto` 사람이 충분하면 사람. */
export type ScoreSource = "human" | "machine" | "auto";

export type EvolutionResult =
  | { adopted: false; reason: string; baseBrier: number | null; decidedCount: number; source: "human" | "machine" }
  | {
      adopted: true;
      gene: string;
      from: number;
      to: number;
      baseBrier: number;
      newBrier: number;
      decidedCount: number;
      folds: number;
      source: "human" | "machine";
      /** 고르는 데 쓰지 않은 뒤 25%에서 잰 값. 채택은 여기서도 나빠지지 않아야 한다. */
      holdout: { n: number; base: number; candidate: number };
    };

async function humanRows(db: Supabase, companyId: string): Promise<ScoredRow[]> {
  const { data } = await db
    .from("work_prediction_scores")
    .select("skill_id, approved, basis, committed_at")
    .eq("company_id", companyId)
    .order("committed_at", { ascending: true }) // 오래된 것부터 — 재생 순서
    .limit(LOOKBACK);
  return (data ?? []) as ScoredRow[];
}

export async function runEvolution(
  db: Supabase,
  companyId: string,
  opts: { source?: ScoreSource } = {},
): Promise<EvolutionResult> {
  const want = opts.source ?? "auto";
  let source: "human" | "machine" = "human";
  let rows = want === "machine" ? [] : await humanRows(db, companyId);
  if (want === "machine" || (want === "auto" && rows.length < MIN_DECIDED)) {
    const machine = await machineScoredRows(db, companyId);
    // 사람 판정이 문턱을 못 넘을 때만 기계 쪽으로 간다. 둘 다 모자라면 사람 쪽 수를 보고한다(그게 진짜 막힌 곳이다).
    if (want === "machine" || machine.length >= MIN_DECIDED) { rows = machine; source = "machine"; }
  }

  if (rows.length < MIN_DECIDED) {
    return {
      adopted: false,
      reason: `판정 ${rows.length}건 (<${MIN_DECIDED}) — 아직 이르다`,
      baseBrier: null,
      decidedCount: rows.length,
      source,
    };
  }

  const base = await genomeFor(db, companyId);
  const candidates = candidatesFrom(base);

  // 앞 75%로만 고른다. 뒤 25%는 고르는 동안 한 번도 안 본다.
  const cut = Math.max(MIN_DECIDED, Math.floor(rows.length * (1 - HOLDOUT_SHARE)));
  const train = rows.slice(0, cut);
  const holdoutN = rows.length - cut;
  const baseBrier = backtest(train, base);

  let best: { candidate: Candidate; brier: number } | null = null;
  for (const candidate of candidates) {
    const brier = backtest(train, candidate.genome);
    if (best === null || brier < best.brier) best = { candidate, brier };
  }

  const kind = source === "machine" ? "기계 판정" : "사람 판정";
  if (!best || !Number.isFinite(best.brier) || baseBrier - best.brier < MIN_IMPROVEMENT) {
    return {
      adopted: false,
      reason: `개선 없음 (기준 ${baseBrier.toFixed(4)}, 최선 후보 ${best ? best.brier.toFixed(4) : "-"}) · ${kind} ${rows.length}건`,
      baseBrier,
      decidedCount: rows.length,
      source,
    };
  }

  // 떼어 둔 자료에서 다시 — 여기서 나빠지면 앞의 개선은 그 자료에 맞춘 것이다.
  if (holdoutN < 5) {
    return {
      adopted: false,
      reason: `떼어 둘 자료가 ${holdoutN}건뿐(<5) — 확인할 수 없다 · ${kind} ${rows.length}건`,
      baseBrier,
      decidedCount: rows.length,
      source,
    };
  }
  const holdBase = backtest(rows, base, cut);
  const holdBest = backtest(rows, best.candidate.genome, cut);
  if (!Number.isFinite(holdBest) || holdBase - holdBest < HOLDOUT_MIN) {
    return {
      adopted: false,
      reason:
        `떼어 둔 ${holdoutN}건에서 나아지지 않음 (기준 ${holdBase.toFixed(4)} → 후보 ${holdBest.toFixed(4)}) — ` +
        `앞 ${cut}건의 개선 ${(baseBrier - best.brier).toFixed(4)} 는 고른 자료에 맞춘 것 · ${kind}`,
      baseBrier,
      decidedCount: rows.length,
      source,
    };
  }

  // 어느 판정으로 채점했는지 기록에 남긴다 — 둘을 섞어 읽으면 나중에 무엇을 배운 건지 알 수 없다.
  const gene = `${source === "machine" ? "[기계 판정] " : ""}${describeGene(best.candidate)}`;
  const { error } = await db.from("prediction_genomes").insert({
    company_id: companyId,
    genome: best.candidate.genome,
    gene,
    base_brier: baseBrier,
    new_brier: best.brier,
    decided_count: rows.length,
    folds: WARMUP_FOLDS,
  });
  if (error) {
    return { adopted: false, reason: `저장 실패: ${error.message}`, baseBrier, decidedCount: rows.length, source };
  }

  return {
    adopted: true,
    gene,
    from: best.candidate.from,
    to: best.candidate.to,
    baseBrier,
    newBrier: best.brier,
    decidedCount: rows.length,
    folds: WARMUP_FOLDS,
    source,
    holdout: { n: holdoutN, base: holdBase, candidate: holdBest },
  };
}

/**
 * 시간을 거슬러 재생하며 Brier 점수를 낸다.
 *
 * `rows` 는 오래된 것부터 순서대로다. 각 행을 시험할 때 그 앞에 있던
 * 행만 역사로 쓴다 — 미래 데이터를 미리 보면 뒷걸음이 아니라 그냥
 * 답을 베끼는 것이다. 앞쪽 `WARMUP_FOLDS`분의 1은 역사가 얕아서
 * 시험하지 않는다(§9 "성숙 구간"과 같은 생각).
 */
function backtest(rows: ScoredRow[], genome: PredictionGenome, from?: number): number {
  // `from` 을 주면 그 앞은 **역사로만** 쓰고 점수는 그 뒤에서만 낸다(떼어 둔 자료 확인).
  const warmup = from ?? Math.ceil(rows.length / WARMUP_FOLDS);
  let sumSq = 0;
  let n = 0;
  for (let i = warmup; i < rows.length; i++) {
    const row = rows[i];
    const keys = row.basis?.features ?? [];
    if (keys.length === 0) continue;
    // scoreKeys 는 "최신순(index 0 = 가장 최근)" 을 기대한다.
    const history = rows.slice(0, i).reverse();
    const { pApproved } = scoreKeys(history, genome, keys);
    sumSq += (pApproved - row.approved) ** 2;
    n += 1;
  }
  // 시험할 행이 없으면 최악으로 매겨 채택되지 않게 한다.
  return n > 0 ? sumSq / n : 1;
}
