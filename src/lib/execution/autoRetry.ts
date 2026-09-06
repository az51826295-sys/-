import type { SupabaseClient } from "@supabase/supabase-js";

type Supabase = SupabaseClient;

/**
 * 스스로 다시 — 계획 3 (2026-09-07).
 *
 * 유니티 검사가 떨어지면 지금까지는 **사람**이 "고쳐 줘" 라고 해야 다음 판이 돌았다(09-06 기사
 * 재질, 세 번). 평가-최적화 루프: 떨어진 줄을 그대로 다음 업무의 설명으로 삼아 같은 직원에게
 * 다시 시킨다. 세 번까지. 그래도 떨어지면 사람에게 온다(그때는 말이 필요한 문제다).
 *
 * 만드는 것은 대화가 만드는 것과 같다: 업무 행 + 대기열 실행 행(워커가 집는다) + 대화 턴
 * (`attachments.assignment` — 그래야 결과가 그 턴에 돌아온다). 되돌기 횟수는
 * `role_input_json.autoRetry` 로 센다(고치는 판이 이어받는다).
 */
export const MAX_AUTO_RETRIES = 3;

export async function scheduleAutoRetry(
  db: Supabase,
  deliverableId: string,
  failedLines: string[],
  conversationId: string,
): Promise<{ scheduled: false; why: string } | { scheduled: true; n: number; assignmentId: string }> {
  const { data: d } = await db
    .from("deliverables")
    .select("id, title, assignment_id, company_id, company_employee_id, deliverable_type")
    .eq("id", deliverableId)
    .maybeSingle();
  if (!d) return { scheduled: false, why: "산출물 없음" };
  if (d.deliverable_type !== "app_build") return { scheduled: false, why: "코드 판만 스스로 다시 한다" };

  const { data: a } = await db
    .from("assignments")
    .select("id, title, description, role_input_json, role_input_schema_id, priority, source_type, assignment_type, assignment_scope")
    .eq("id", d.assignment_id)
    .maybeSingle();
  if (!a) return { scheduled: false, why: "업무 없음" };
  const prevN = Number((a.role_input_json as { autoRetry?: number } | null)?.autoRetry ?? 0);
  if (prevN >= MAX_AUTO_RETRIES) return { scheduled: false, why: `이미 ${prevN}번 스스로 다시 했다` };

  // 같은 직원이 지금 다른 일을 하고 있으면 대기열에 선다(워커가 차례로 집는다).
  const n = prevN + 1;
  const title = `유니티 검사 떨어진 줄 고치기 (${n}/${MAX_AUTO_RETRIES}) — ${d.title}`.slice(0, 120);
  const description =
    `유니티 합격 시험에서 아래 줄이 떨어졌다. **이 줄만** 고친다. 다른 기능은 건드리지 않는다.\n` +
    failedLines.map((f) => `- ${f}`).join("\n") +
    `\n\n지난 판의 파일을 바탕으로 고치고, 바꾼 파일만 낸다.`;
  const { data: made, error } = await db
    .from("assignments")
    .insert({
      company_id: d.company_id,
      company_employee_id: d.company_employee_id,
      title,
      description,
      priority: a.priority ?? "normal",
      status: "assigned",
      role_input_json: { previousDeliverableId: deliverableId, autoRetry: n },
      role_input_schema_id: a.role_input_schema_id,
      source_type: a.source_type ?? "manual",
      assignment_type: a.assignment_type ?? "manager",
      assignment_scope: a.assignment_scope ?? "manager",
    })
    .select("id")
    .single();
  if (error || !made) return { scheduled: false, why: error?.message ?? "업무 못 만듦" };

  const { error: e2 } = await db.from("work_executions").insert({
    company_id: d.company_id,
    assignment_id: made.id,
    company_employee_id: d.company_employee_id,
    status: "queued",
    current_step: "context_loaded",
    attempt_number: 1,
  });
  if (e2) return { scheduled: false, why: e2.message };
  await db.from("assignments").update({ status: "queued" }).eq("id", made.id);

  await db.from("conversation_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: `실패한 줄 ${failedLines.length}개를 Dev 가 스스로 고쳐요 (${n}/${MAX_AUTO_RETRIES}). 끝나면 여기 붙고, 유니티가 다시 검사해요.`,
    attachments: { assignment: { id: made.id, title, queued: true }, autoRetry: n },
  });
  return { scheduled: true, n, assignmentId: made.id as string };
}
