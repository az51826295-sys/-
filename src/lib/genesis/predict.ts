import type { Supabase } from "@/lib/execution/shared";
import { BASE_GENOME, type PredictionGenome } from "@/lib/genesis/genome";

/**
 * 실행 전 예측.
 *
 * 직원이 일을 시작하기 전에 "이 일이 매니저의 수정 요청 없이 승인될
 * 확률"을 적어 둔다. 지금까지 이 앱은 결과를 본 뒤에 교훈을 뽑았다.
 * 그건 회고지 예측이 아니고, 예측이 없으면 나아지고 있는지 잴 수 없다.
 *
 * 모델을 부르지 않는다. 확률은 이 회사의 과거 판정에서 계산된다 —
 * 예측 한 건마다 API 호출을 하면 회사당 30일 $3 한도가 예측에만 다
 * 쓰인다. 통계로 충분히 시작할 수 있고, 나중에 모델로 바꿔도 원장과
 * 채점 방식은 그대로다.
 */

/** 이 회사의 최근 판정만 본다. 오래된 기준은 지금 기준이 아니다. */
export const LOOKBACK = 400;

/**
 * 이 회사가 쓰는 예측 유전자.
 *
 * 상수였던 값들이 이제 여기서 온다. 회사마다 다를 수 있고, 진화가 채택한 것이
 * 있으면 그것을, 없으면 출발점을 쓴다 — **처음 쓰는 회사의 동작은 예전과 똑같다.**
 * 진화는 판정이 쌓인 뒤에야 무언가를 바꾼다.
 */
export async function genomeFor(
  db: Supabase,
  companyId: string,
): Promise<PredictionGenome> {
  const { data } = await db
    .from("prediction_genomes")
    .select("genome")
    .eq("company_id", companyId)
    .order("adopted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const stored = (data as { genome?: Partial<PredictionGenome> } | null)?.genome;
  // 저장된 것이 일부만 있어도 나머지는 출발점으로 채운다. 스키마가 늘어난 뒤에
  // 옛 행을 읽어도 터지지 않게.
  return { ...BASE_GENOME, ...(stored ?? {}) };
}

/**
 * 한 건 거슬러 올라갈 때마다 곱해지는 무게.
 *
 * 0.99면 약 69건 전의 판정이 절반 무게가 된다. 시뮬레이터에서
 * decay 0.98 이 가장 큰 단일 개선이었는데, 거기서는 셀 하나가
 * 수백 번 갱신되는 반면 여기서는 회사 전체 판정이 수십~수백 건
 * 규모라 감쇠를 그만큼 완만하게 잡았다.
 */
const RECENCY = 0.99;

export type PredictionFeatures = {
  skillId: string;
  assignmentType: "manager" | "internal" | "project";
  recurring: boolean;
  /** 회상된 기억 수. 많을수록 아는 게 많다는 뜻이지만, 정말 그런지는
   *  데이터가 말해 줄 것이다. */
  memoryCount: number;
};

/** 기억 수를 구간으로 접는다. 셀당 근거가 모이도록. */
function memoryBucket(n: number): string {
  if (n === 0) return "none";
  if (n <= 4) return "few";
  return "many";
}

function featureKeys(f: PredictionFeatures): string[] {
  return [
    `skill=${f.skillId}`,
    `type=${f.assignmentType}`,
    `recurring=${f.recurring}`,
    `memory=${memoryBucket(f.memoryCount)}`,
  ];
}

type Cell = { ok: number; n: number };

export type ScoredRow = {
  skill_id: string;
  approved: number;
  basis: { features?: string[] } | null;
  committed_at?: string;
};

/**
 * 승인 확률 추정.
 *
 * 승인은 여러 조건을 동시에 만족해야 나온다 — 하나라도 어긋나면
 * 수정 요청이다. 그래서 평균이 아니라 **가장 약한 고리**가 확률을
 * 결정한다. 시뮬레이터에서 이 형태가 실제로 잘 맞았다.
 *
 * 순수 계산부(`scoreKeys`)는 DB를 모른다. `estimateApproval`(운영) 과
 * `evolve.ts`(뒷걸음 시험) 이 둘 다 이 함수 하나를 부른다 — 계산식이
 * 두 곳에 따로 있으면 진화가 실제로 쓰이는 것과 다른 것을 채점하게
 * 된다. 뒷걸음 시험은 그 행이 실제로 커밋됐을 때 이미 정해졌던
 * `basis.features` 를 그대로 조회 키로 쓴다 — 그때 어떤 스킬·유형·
 * 기억 개수였는지를 오늘의 규칙(`memoryBucket` 경계 등)으로 다시
 * 계산하면 안 되기 때문이다.
 */
export function scoreKeys(
  rows: ScoredRow[],
  genome: PredictionGenome,
  keys: string[],
): { pApproved: number; weakest: string; support: number } {
  const cells = new Map<string, Cell>();

  // 최신순으로 받았으므로 index 0 이 가장 최근이다.
  rows.forEach((row, index) => {
    // ── 오래된 판정은 덜 센다 ──────────────────────────────────
    //
    // 매니저의 기준은 바뀐다. 담당자가 바뀌거나, 회사 상황이 바뀌거나,
    // 그냥 취향이 바뀐다. 400건을 전부 동등하게 세면 반년 전 기준이
    // 지금 기준과 같은 무게를 갖는다.
    //
    // 시뮬레이터에서 이게 가장 큰 단일 개선이었다 — 기준이 도중에
    // 뒤집히는 세계에서 망각을 빠르게 한 것만으로 +16.55%p.
    // 반대로 오래 기억하는 개체는 기준이 바뀐 뒤 영영 회복하지
    // 못했다.
    //
    // 지우지 않고 무게만 줄이는 것도 시뮬레이터에서 온 결론이다.
    // 통째로 버리면 낡은 확신과 함께 맞는 지식도 사라진다.
    const weight = Math.pow(genome.recency, index);
    for (const key of row.basis?.features ?? []) {
      const c = cells.get(key) ?? { ok: 0, n: 0 };
      c.n += weight;
      if (row.approved === 1) c.ok += weight;
      cells.set(key, c);
    }
  });

  let p = 1;
  let weakest = "(근거 없음)";
  let support = 0;

  for (const key of keys) {
    const c = cells.get(key);
    const n = c?.n ?? 0;
    const estimate = ((c?.ok ?? 0) + genome.prior * genome.priorWeight) / (n + genome.priorWeight);
    if (estimate < p) {
      p = estimate;
      weakest = key;
      // 사람이 읽는 숫자라 소수점은 의미가 없다.
      support = Math.round(n);
    }
  }

  return {
    pApproved: Math.min(genome.ceiling, Math.max(genome.floor, p)),
    weakest,
    support,
  };
}

export async function estimateApproval(
  db: Supabase,
  companyId: string,
  features: PredictionFeatures,
): Promise<{ pApproved: number; weakest: string; support: number; feed: "human" | "machine"; feedRows: number }> {
  const g = await genomeFor(db, companyId);
  const { rows, source } = await feedFor(db, companyId);
  return { ...scoreKeys(rows, g, featureKeys(features)), feed: source, feedRows: rows.length };
}

/** 사람 판정이 이만큼 쌓이면 사람 쪽만 본다(`evolve.ts` 의 MIN_DECIDED 와 같은 값 — 진화와 예측기가 같은 밥을 먹어야 한다). */
export const HUMAN_FEED_MIN = 40;

/**
 * **예측기가 먹는 것** (168회차 09-18).
 *
 * 계기판(`vitals.ts`) 첫 판독: 50일 동안 예측이 전부 **0.700** 이었다. 이 함수가 사람 판정(`work_prediction_scores`)만 읽었는데
 * 그게 회사당 0~2건이라, 늘 근거 없음 → 사전값. 115회차에 진화(`evolve.ts`)는 현실·기계 판정으로 유전자를 고르게 고쳤지만
 * **예측기는 그대로 뒀다** — 유전자는 진화하는데 그 유전자가 읽을 역사가 비어 있었다. 심장이 빈 접시를 읽고 있었다.
 *
 * 잇기 전에 쟀다(`genesis_feed_probe.mts`, 기대를 먼저 얼림): 시간순으로 걸으며 그때까지의 현실·기계 판정만 먹였을 때
 * Brier 0.2607 → **0.2127**(사장님 회사 82건), 0.1371 → 0.1180(다른 회사 17건). 말하는 확률이 한 가지에서 40가지가 됐다.
 * (3D 자산 영역만 0.090 → 0.110 으로 조금 나빠졌다 — 13건. 계기판이 영역별로 계속 본다.)
 *
 * 규칙은 진화와 같다: 사람 판정이 문턱을 넘으면 사람 쪽만, 아니면 현실(유니티)·기계 판정. **마지막 칸은 사람**이라는 원칙은 그대로다.
 * 직원의 자기 보고는 여기에도 안 들어온다(`machineScores.ts` 가 읽는 것은 유니티 검사와 결과물 자동 판정뿐이다).
 */
export async function feedFor(db: Supabase, companyId: string): Promise<{ rows: ScoredRow[]; source: "human" | "machine" }> {
  const { data } = await db
    .from("work_prediction_scores")
    .select("skill_id, approved, basis")
    .eq("company_id", companyId)
    .order("committed_at", { ascending: false })
    .limit(LOOKBACK);
  const human = (data ?? []) as ScoredRow[];
  if (human.length >= HUMAN_FEED_MIN) return { rows: human, source: "human" };
  try {
    // machineScores 가 이 파일의 LOOKBACK 을 가져다 써서, 위에서 바로 import 하면 서로 물린다.
    const { machineScoredRows } = await import("@/lib/genesis/machineScores");
    const machine = await machineScoredRows(db, companyId); // 오래된 것부터 온다 — scoreKeys 는 최신순을 기대한다.
    if (machine.length > human.length) return { rows: machine.reverse(), source: "machine" };
  } catch { /* 못 읽으면 사람 쪽 그대로 — 예측을 못 남기는 것이 일을 막을 이유는 아니다 */ }
  return { rows: human, source: "human" };
}

/**
 * 예측을 원장에 커밋한다.
 *
 * 행동 이전이고, 결과 이전이다. 커밋된 뒤로는 수정할 수 없다 — DB
 * 트리거가 UPDATE를 거부한다. 앱 코드의 약속이 아니라 제약이어야
 * 하는 이유는 단순하다. 코드는 언젠가 잊는다.
 *
 * 실패해도 예외를 던지지 않는다. 예측을 남기지 못하는 것은 일을
 * 거부할 이유가 아니다 — 기억 회상이 실패해도 일은 하는 것과 같은
 * 규칙이다. 다만 그 실행은 채점 대상에서 빠진다.
 */
export async function commitPrediction(
  db: Supabase,
  input: {
    companyId: string;
    assignmentId: string;
    workExecutionId: string;
    companyEmployeeId: string;
    features: PredictionFeatures;
  },
): Promise<{ pApproved: number } | null> {
  // 동료 간 업무(internal)는 매니저 검토를 거치지 않는다 — 산출물이
  // 자동 승인되고 deliverable_reviews 행이 생기지 않는다. 즉 이 예측은
  // **영원히 채점될 수 없다.**
  //
  // 검증할 수 없는 예측은 예측이 아니다. 적어 봐야 채점 뷰에 걸리지
  // 않아 추정기에 기여하지도 못하고, 원장에 죽은 행만 쌓인다.
  // 현실이 답을 주는 곳에서만 예측한다.
  if (input.features.assignmentType === "internal") return null;

  try {
    // 예측은 실행 경로만 쓴다. RLS는 사용자 세션의 INSERT를 막고 있고,
    // 그건 의도된 것이다 — 매니저가 자기 직원의 예측을 대신 적는 일은
    // 있어서는 안 된다. 그래서 여기서만 서비스 클라이언트를 쓴다.
    const { createServiceClient } = await import("@/lib/supabase/service");
    const service = createServiceClient();

    const { pApproved, weakest, support, feed, feedRows } = await estimateApproval(
      service,
      input.companyId,
      input.features,
    );

    const { error } = await service.from("work_predictions").insert({
      company_id: input.companyId,
      assignment_id: input.assignmentId,
      work_execution_id: input.workExecutionId,
      company_employee_id: input.companyEmployeeId,
      skill_id: input.features.skillId,
      p_approved: pApproved,
      basis: {
        features: featureKeys(input.features),
        weakest,
        support,
        memoryCount: input.features.memoryCount,
        // 168회차: 이 확률이 무엇을 먹고 나왔나(출처). 사람 판정인가, 현실·기계 판정인가, 몇 건인가.
        feed,
        feedRows,
      },
    });

    if (error) return null;
    return { pApproved };
  } catch {
    return null;
  }
}
