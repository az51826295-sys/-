import type { SupabaseClient } from "@supabase/supabase-js";

type Supabase = SupabaseClient;

/**
 * 되묻기 — 설계도 단계 (교과 14, 35회차 09-07).
 *
 * 지금까지 사장님 말은 곧바로 실행됐다. 실행은 스스로 고쳐지지만(32~34회차), **애초에 무엇을 만들지**는
 * 아무도 되묻지 않았다. 08-24 북극성: pass/fail 심판을 넘어 "구성에 맞나" 로 재구성해 되묻는 연출가.
 * 첫 조각: Dev 가 계획(기준·기대치)을 쓴 뒤 코드를 쓰기 **전에** 멈추고, 대화에 "이렇게 이해했어요" 를
 * 숫자로 보인다. 사장님이 '시작' 하면 이어서 만들고, 고칠 말을 하면 그 말을 얹어 계획을 다시 쓴다.
 *
 * 배관: 실행 상태표(work_executions.status)는 CHECK 로 잠겨 있어(waiting 거절, 09-07 15:40) 새 상태를 못 넣는다.
 * 그래서 멈춤은 `fail_work_execution(WAITING_APPROVAL)` 로 적고, 사람이 보는 업무 상태(assignments.status)를
 * `waiting` 으로 둔다. 이어갈 땐 **새 실행**을 만들되 지난 실행의 단계 저장(steps)을 복사한다 — 계획을 다시 사지 않는다.
 */
export class WaitingForApproval extends Error {
  constructor(public readonly assignmentId: string, public readonly executionId: string) {
    super("사장님 확인을 기다린다");
    this.name = "WaitingForApproval";
  }
}

export type ApprovalCard = {
  title: string;
  /** 숫자로 적은 기대치와 기준 — 사람이 3초 안에 읽을 줄들. */
  lines: string[];
  estimate: string;
};

/** 업무를 시킨 대화. 대화 턴의 attachments.assignment.id 로 찾는다(자동 재시도·되묻기 턴도 같은 모양). */
export async function conversationOfAssignment(db: Supabase, assignmentId: string): Promise<string | null> {
  const { data } = await db
    .from("conversation_messages")
    .select("conversation_id")
    .contains("attachments", { assignment: { id: assignmentId } })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.conversation_id as string | undefined) ?? null;
}

/** 계획을 대화에 보이고 멈춘다. 실행은 WaitingForApproval 을 던져 엔진이 상태를 적는다. */
export async function askApproval(
  db: Supabase,
  args: { assignmentId: string; executionId: string; who: string; card: ApprovalCard; round: number },
): Promise<never> {
  const conversationId = await conversationOfAssignment(db, args.assignmentId);
  if (conversationId) {
    const content =
      `**${args.who} · 계획 확인** — 이렇게 이해했어요.\n\n` +
      `**${args.card.title}**\n` +
      args.card.lines.map((l) => `- ${l}`).join("\n") +
      `\n\n${args.card.estimate}\n\n` +
      `맞으면 **'시작'** 이라고 해 주세요. 고칠 게 있으면 그냥 말해 주시면 계획을 다시 써요.` +
      (args.round > 0 ? ` (다시 쓴 계획 ${args.round}번째 — 한 번 더 고치면 그대로 시작해요)` : "");
    await db.from("conversation_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content,
      attachments: { assignment: { id: args.assignmentId, title: args.card.title, queued: false }, approval: { assignmentId: args.assignmentId, executionId: args.executionId, round: args.round } },
    });
  }
  throw new WaitingForApproval(args.assignmentId, args.executionId);
}

export type PendingApproval = { assignmentId: string; executionId: string; title: string; round: number; companyEmployeeId: string };

/** 이 대화에서 확인을 기다리는 계획이 있나. 마지막 되묻기 턴의 업무가 아직 waiting 이면 그것. */
export async function pendingApproval(db: Supabase, conversationId: string): Promise<PendingApproval | null> {
  const { data: m } = await db
    .from("conversation_messages")
    .select("attachments")
    .eq("conversation_id", conversationId)
    .not("attachments->approval", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ap = (m?.attachments as { approval?: { assignmentId: string; executionId: string; round?: number } } | null)?.approval;
  if (!ap) return null;
  const { data: a } = await db
    .from("assignments")
    .select("id, title, status, company_employee_id")
    .eq("id", ap.assignmentId)
    .maybeSingle();
  if (!a || a.status !== "waiting") return null;
  return { assignmentId: a.id as string, executionId: ap.executionId, title: a.title as string, round: ap.round ?? 0, companyEmployeeId: a.company_employee_id as string };
}

const YES = /^\s*(시작|시작해|시작해요|시작하자|응|네|예|넵|맞아|맞아요|좋아|좋아요|그래|그래요|그대로|그렇게|ㅇㅇ|ㅇ|ok|okay|go|가자|진행|진행해|해|해줘|해 줘|고)\s*[.!~]*\s*$/i;
const NO = /^\s*(취소|그만|하지 ?마|하지 마요|됐어|됐어요|안 해|멈춰)\s*[.!~]*\s*$/;

export function classifyApprovalReply(text: string): "yes" | "cancel" | "correction" {
  if (YES.test(text)) return "yes";
  if (NO.test(text)) return "cancel";
  return "correction";
}

/**
 * 이어간다. correction 이 있으면 설명에 얹고 계획 단계 저장을 버려 계획을 다시 쓰게 한다(그리고 다시 되묻는다).
 * 두 번 고친 뒤엔 그대로 시작한다 — 되묻기가 끝없이 돌면 그게 헛도는 판이다.
 */
export async function resumeApproved(
  db: Supabase,
  pending: PendingApproval,
  correction: string | null,
): Promise<{ mode: "start" | "replan" }> {
  const { data: a } = await db
    .from("assignments")
    .select("id, company_id, company_employee_id, description, role_input_json")
    .eq("id", pending.assignmentId)
    .maybeSingle();
  if (!a) return { mode: "start" };
  const { data: ex } = await db
    .from("work_executions")
    .select("metrics_json")
    .eq("id", pending.executionId)
    .maybeSingle();
  const metrics = ((ex?.metrics_json as Record<string, unknown> | null) ?? {});
  const steps = { ...((metrics.steps as Record<string, unknown> | undefined) ?? {}) };

  const round = pending.round + (correction ? 1 : 0);
  const replan = !!correction && round <= 2;
  if (replan) delete steps.plan;
  const roleInput = { ...((a.role_input_json as Record<string, unknown> | null) ?? {}), approved: !replan, approvalRound: round };
  const description = correction
    ? `${(a.description as string | null) ?? ""}\n\n## 사장님 수정 (계획 확인 뒤, ${round}번째)\n- ${correction.trim()}`
    : (a.description as string | null);

  await db.from("assignments").update({ description, role_input_json: { ...roleInput, awaitingApproval: null }, status: "queued" }).eq("id", a.id);
  await db.from("work_executions").insert({
    company_id: a.company_id,
    assignment_id: a.id,
    company_employee_id: a.company_employee_id,
    status: "queued",
    current_step: "context_loaded",
    attempt_number: round + 2,
    metrics_json: { steps },
  });
  return { mode: replan ? "replan" : "start" };
}

/** 사장님이 접었다. 업무는 cancelled — 직원은 다음 일을 받을 수 있게. */
export async function cancelPending(db: Supabase, pending: PendingApproval): Promise<void> {
  await db.from("assignments").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", pending.assignmentId);
  await db.from("company_employees").update({ work_status: "ready", current_assignment_id: null }).eq("id", pending.companyEmployeeId);
}
