import type { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type Supabase = SupabaseClient<any, any, any>;

/**
 * 기계적인 고장이면 한 번은 스스로 다시 (117회차 09-15).
 *
 * 65회차에 계획 단계의 한도를 정하면서 이렇게 적어 뒀다: "싸게 실패하고 다시 한다." 그런데 **다시 하는 쪽을 안 만들었다** —
 * 잘리면 실행이 죽고, 대화에는 "못 했습니다" 가 뜨고, 사장님이 같은 말을 다시 쳐야 했다. 실제로 실패 39건 중 잘림이 7건
 * (그중 5건이 계획 단계), 저장 시간 초과가 3건이었다.
 *
 * 품질 실패와는 다르다. 결과물이 검사에 떨어진 것은 **배울 거리**이고(`autoRetry`·`selfRetry` 가 떨어진 줄을 고쳐 다시 낸다),
 * 출력이 잘리거나 저장이 시간 초과된 것은 **아무것도 알려 주지 않는 고장**이다. 그런 건 조용히 한 번 더 하면 된다.
 *
 * 규율 셋:
 *   - 기계적인 코드만(아래 목록). 자기모순·맥락 부족처럼 뜻이 있는 실패는 그대로 사람에게 간다.
 *   - **한 번만.** 두 번째도 잘리면 진짜 실패다(폭주한 계획이 60,000 토큰을 태운 적이 있다 — 65회차).
 *   - 업무를 다시 대기열에 세우므로 대화에는 실패가 안 뜬다(`workReturns` 는 업무가 죽었을 때만 말한다).
 */

/** 다시 해 볼 만한 고장. 뜻이 있는 실패(SELF_INCONSISTENT·CONTEXT_INCOMPLETE)는 넣지 않는다. */
const MECHANICAL = new Set(["MODEL_OUTPUT_TRUNCATED", "DELIVERABLE_SAVE_FAILED"]);
/** 이 횟수를 넘으면 진짜 실패로 둔다. */
export const MAX_MECHANICAL_RETRIES = 1;

export function isMechanical(code: string, message: string): boolean {
  return MECHANICAL.has(code) || MECHANICAL.has(message.trim()) || message.includes("MODEL_OUTPUT_TRUNCATED");
}

/**
 * 죽은 실행을 이어받을 새 실행을 대기열에 넣는다. 넣었으면 true.
 * 실패해도 던지지 않는다 — 다시 하기에 실패하는 것이 원래 실패를 덮을 이유는 없다.
 */
export async function scheduleMechanicalRetry(
  db: Supabase,
  execution: { id: string; company_id: string; assignment_id: string; company_employee_id: string },
  code: string,
  message: string,
): Promise<{ retried: boolean; why?: string }> {
  try {
    if (!isMechanical(code, message)) return { retried: false, why: "기계적인 고장이 아니다" };

    // 이 업무에서 기계적인 이유로 이미 몇 번 다시 했나. 표시는 실행 행에 남긴다(업무 설명을 건드리지 않는다).
    const { data: prior } = await db
      .from("work_executions")
      .select("id, attempt_number")
      .eq("assignment_id", execution.assignment_id)
      .order("attempt_number", { ascending: false });
    const rows = (prior ?? []) as { id: string; attempt_number: number | null }[];
    const highest = rows.reduce((m, r) => Math.max(m, r.attempt_number ?? 1), 1);
    if (highest > MAX_MECHANICAL_RETRIES) {
      return { retried: false, why: `이미 ${highest - 1}번 다시 했다(최대 ${MAX_MECHANICAL_RETRIES})` };
    }

    const { error } = await db.from("work_executions").insert({
      company_id: execution.company_id,
      assignment_id: execution.assignment_id,
      company_employee_id: execution.company_employee_id,
      status: "queued",
      current_step: "context_loaded",
      attempt_number: highest + 1,
    });
    if (error) return { retried: false, why: error.message };

    // 업무를 대기열로 되돌린다 — 이게 있어야 워커가 집고, 대화에 "못 했습니다" 가 안 뜬다.
    await db.from("assignments").update({ status: "queued" }).eq("id", execution.assignment_id);
    await db.from("company_employees").update({ work_status: "ready" }).eq("id", execution.company_employee_id);
    return { retried: true };
  } catch (e) {
    return { retried: false, why: e instanceof Error ? e.message : String(e) };
  }
}
