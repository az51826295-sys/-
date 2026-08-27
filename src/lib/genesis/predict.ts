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
const LOOKBACK = 400;

/**
 * 이 회사가 쓰는 예측 유전자.
 *
 * 상수였던 값들이 이제 여기서 온다. 회사마다 다를 수 있고, 진화가 채택한 것이
 * 있으면 그것을, 없으면 출발점을 쓴다 — **처음 쓰는 회사의 동작은 예전과 똑같다.**
 * 진화는 판정이 쌓인 뒤에야 무언가를 바꾼다.
 */
async function genomeFor(
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

type ScoredRow = {
  skill_id: string;
  approved: number;
  basis: { features?: string[] } | null;
};

/**
 * 승인 확률 추정.
 *
 * 승인은 여러 조건을 동시에 만족해야 나온다 — 하나라도 어긋나면
 * 수정 요청이다. 그래서 평균이 아니라 **가장 약한 고리**가 확률을
 * 결정한다. 시뮬레이터에서 이 형태가 실제로 잘 맞았다.
 */
export async function estimateApproval(
  db: Supabase,
  companyId: string,
  features: PredictionFeatures,
): Promise<{ pApproved: number; weakest: string; support: number }> {
  const g = await genomeFor(db, companyId);
  const cells = new Map<string, Cell>();

  const { data } = await db
    .from("work_prediction_scores")
    .select("skill_id, approved, basis")
    .eq("company_id", companyId)
    .order("committed_at", { ascending: false })
    .limit(LOOKBACK);

  // 최신순으로 받았으므로 index 0 이 가장 최근이다.
  (data ?? []).forEach((raw, index) => {
    const row = raw as ScoredRow;
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
    const weight = Math.pow(g.recency, index);
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

  for (const key of featureKeys(features)) {
    const c = cells.get(key);
    const n = c?.n ?? 0;
    const estimate = ((c?.ok ?? 0) + g.prior * g.priorWeight) / (n + g.priorWeight);
    if (estimate < p) {
      p = estimate;
      weakest = key;
      // 사람이 읽는 숫자라 소수점은 의미가 없다.
      support = Math.round(n);
    }
  }

  return {
    pApproved: Math.min(g.ceiling, Math.max(g.floor, p)),
    weakest,
    support,
  };
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

    const { pApproved, weakest, support } = await estimateApproval(
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
      },
    });

    if (error) return null;
    return { pApproved };
  } catch {
    return null;
  }
}
