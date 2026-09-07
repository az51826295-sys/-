import type { SupabaseClient } from "@supabase/supabase-js";
import { conversationOfAssignment } from "@/lib/execution/approval";

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
 *
 * **41회차(09-07): 게임 밖으로.** 처음엔 유니티 검사 문에서만 불렀고 app_build 만 받았다. 그런데 Ana(인용이 원문에
 * 없다)와 Vid(첫 장면이 9.8초)도 자를 갖고 있는데 아무도 스스로 고치지 않았다 — 로키의 대표 고리가 게임 전용이었던 것.
 * 이제 산출물의 판정(`content_json.verdict.cases`)에 떨어진 줄이 있으면 **엔진이** 부른다(`selfRetryFromVerdict`).
 * 대화는 업무 id 로 찾는다(유니티 길은 산출물 id 로 찾는다 — 그쪽은 그때 대화를 모른다).
 */
export const MAX_AUTO_RETRIES = 3;

export async function scheduleAutoRetry(
  db: Supabase,
  deliverableId: string,
  failedLines: string[],
  /** 결과가 돌아갈 대화. 없으면 업무 id 로 찾는다(41회차: 엔진에서 부를 땐 모른다). */
  conversationId: string | null,
): Promise<{ scheduled: false; why: string } | { scheduled: true; n: number; assignmentId: string }> {
  const { data: d } = await db
    .from("deliverables")
    .select("id, title, assignment_id, company_id, company_employee_id, deliverable_type")
    .eq("id", deliverableId)
    .maybeSingle();
  if (!d) return { scheduled: false, why: "산출물 없음" };

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
  const code = d.deliverable_type === "app_build";
  const title = `${code ? "유니티 검사" : "검사"} 떨어진 줄 고치기 (${n}/${MAX_AUTO_RETRIES}) — ${d.title}`.slice(0, 120);
  const description =
    `${code ? "유니티 합격 시험" : "검사"}에서 아래 줄이 떨어졌다. **이 줄만** 고친다. 다른 것은 건드리지 않는다.\n` +
    failedLines.map((f) => `- ${f}`).join("\n") +
    (code
      ? `\n\n지난 판의 파일을 바탕으로 고치고, 바꾼 파일만 낸다.`
      : `\n\n지난 판과 **같은 일**을 다시 한다(같은 링크·같은 주제). 위 줄만 고쳐서.\n\n## 지난 판의 업무\n${a.description ?? ""}`);
  const { data: emp } = await db
    .from("company_employees")
    .select("employees(name)")
    .eq("id", d.company_employee_id)
    .maybeSingle();
  const who = ((emp as { employees?: { name?: string } | null } | null)?.employees?.name) ?? "담당자";

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

  // 대화를 안 받았으면(엔진에서 부른 41회차 길) 지난 업무가 실린 대화를 찾는다 — 결과가 돌아갈 자리가 거기다.
  const convo = conversationId ?? (await conversationOfAssignment(db, d.assignment_id as string));
  if (!convo) return { scheduled: true, n, assignmentId: made.id as string };
  await db.from("conversation_messages").insert({
    conversation_id: convo,
    role: "assistant",
    content: `실패한 줄 ${failedLines.length}개를 ${who} 가 스스로 고쳐요 (${n}/${MAX_AUTO_RETRIES}). 끝나면 여기 붙고, 다시 재요.`,
    attachments: { assignment: { id: made.id, title, queued: true }, autoRetry: n },
  });
  return { scheduled: true, n, assignmentId: made.id as string };
}
