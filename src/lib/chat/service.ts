import { z } from "zod";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { createAssignment } from "@/lib/assignments/service";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import { meterProviders } from "@/lib/costs/meter";
import { defaultProviders } from "@/lib/execution/shared";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 직원과의 대화 한 턴.
 *
 * 채팅은 실행 엔진 밖에서 도는 첫 번째 모델 경로다. 그래서 두 가지를
 * 여기서 직접 지킨다 — 엔진 안에서는 엔진이 지켜 주던 것들이다.
 *
 *   · 지출 한도 — 모델을 부르기 전에 확인한다. 넘었으면 모델 없이
 *     정중히 거절한다 (그 거절은 공짜다).
 *   · 계량 — meterProviders 로 감싸서 대화 한 턴도 장부에 남는다.
 *     채팅이 한도 밖에서 몰래 돈을 쓰는 구멍이 되면 안 된다.
 *
 * 대화는 routine 티어로 돈다. 잡담과 업무 접수는 "무엇을 할지"를
 * 정하는 일이지 산출물 자체가 아니다 — 산출물은 여전히 judgment
 * 티어의 실행 엔진이 만든다.
 */

export type ChatTurnInput = {
  companyEmployeeId: string;
  /** 클라이언트가 들고 있는 대화 기록. 오래된 것은 서버가 자른다. */
  messages: { role: "user" | "assistant"; content: string }[];
};

export type ChatOption = { label: string; description: string | null };

export type ChatTurnResult =
  | {
      ok: true;
      reply: string;
      assignment: { id: string; title: string; queued: boolean } | null;
      /** 매니저가 클릭으로 답할 수 있는 선택지. */
      options: ChatOption[] | null;
    }
  | { ok: false; error: string; status: number };

/** 한 턴에 모델이 보는 대화 기록의 최대 길이. 비용과 초점의 문제다. */
const HISTORY_LIMIT = 20;

const chatOutputSchema = z.object({
  /** 매니저에게 하는 답. 직원의 목소리로. */
  reply: z.string(),
  /**
   * 매니저가 일을 시켰다고 판단되면 채운다. 잡담·질문이면 null.
   *
   * 모델은 제안만 한다 — 실제 생성은 아래에서 기존 createAssignment 를
   * 거치므로 검증·큐잉·한도 규칙이 폼에서 만든 업무와 완전히 같다.
   */
  assignment: z
    .object({
      title: z.string(),
      description: z.string(),
      expectedOutcome: z.string().nullable(),
    })
    .nullable(),
  /**
   * 매니저가 고르면 되는 선택지. 답이 갈림길일 때 채운다.
   *
   * 타이핑 대신 클릭 — 매니저가 문장을 지어내게 하지 말고, 갈림길을
   * 보여 주고 고르게 한다. 확인 질문이 필요 없으면 null.
   */
  options: z
    .array(
      z.object({
        /** 버튼에 그대로 실리는 짧은 문구. */
        label: z.string(),
        /** 이 선택이 무엇을 뜻하는지 한 줄. */
        description: z.string().nullable(),
      }),
    )
    .nullable(),
});

export async function runChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const owned = await getOwnedCompanyEmployee(input.companyEmployeeId);
  if (!owned) {
    return { ok: false, error: "Employee not found.", status: 404 };
  }
  const { supabase, companyEmployee, employee } = owned;

  if (companyEmployee.onboarding_status !== "completed") {
    return {
      ok: false,
      error: `${employee.name} is still onboarding and can't chat yet.`,
      status: 409,
    };
  }

  const definition = getEmployeeDefinition(employee.slug);
  if (!definition) {
    return { ok: false, error: "This employee isn't available.", status: 400 };
  }

  // 모델을 부르기 전의 한도 확인. 채팅으로 새는 지출은 없어야 한다.
  const blocked = await blockedBySpendLimit(supabase, companyEmployee.company_id);
  if (blocked) {
    return {
      ok: true,
      reply:
        "I'd love to help, but the company has reached its spending limit for this period. " +
        "I can pick this up as soon as the allowance resets.",
      assignment: null,
      options: null,
    };
  }

  // ── 직원이 아는 것들 ─────────────────────────────────────────────
  //
  // 대화 상대가 회사 상황을 모르면 챗은 장식이다. 다만 haiku 티어라
  // 컨텍스트는 요점만: 지금 하는 일, 검토 대기 중인 것, 최근 산출물.
  const [{ data: activeRows }, { data: pendingRows }, { data: recentRows }] =
    await Promise.all([
      supabase
        .from("assignments")
        .select("title, status")
        .eq("company_employee_id", companyEmployee.id)
        .in("status", ["assigned", "queued", "working", "submitted", "waiting"])
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("deliverables")
        .select("title")
        .eq("company_employee_id", companyEmployee.id)
        .eq("status", "submitted")
        .limit(3),
      supabase
        .from("deliverables")
        .select("title, status")
        .eq("company_employee_id", companyEmployee.id)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

  const workload = (activeRows ?? [])
    .map((a) => `- ${a.title} (${a.status})`)
    .join("\n");
  const awaiting = (pendingRows ?? []).map((d) => `- ${d.title}`).join("\n");
  const recent = (recentRows ?? [])
    .map((d) => `- ${d.title} (${d.status})`)
    .join("\n");

  const systemInstructions = `You are ${employee.name}, ${employee.role} at the manager's company. You are chatting with your manager.

Who you are: ${employee.description ?? definition.deliverable.type}

Your current workload:
${workload || "(nothing active right now)"}

Deliverables waiting for the manager's review:
${awaiting || "(none)"}

Recent deliverables:
${recent || "(none)"}

How to behave:
- Reply in the manager's language (Korean if they write Korean).
- Be a colleague, not a form: brief, warm, concrete.
- If the manager is asking you to DO work — research, a report, a list — fill the "assignment" object: a clear title (10+ chars), a description of what to do and why (20+ chars), and expectedOutcome when the manager said what success looks like. Confirm in your reply what you're taking on.
- One assignment at a time: if you already have active work, new work will queue behind it — say so.
- If they're just asking a question or chatting, answer it and leave "assignment" null.
- When the next step is a choice — scope, priority, which direction to take — don't ask an open question. Fill "options" with 2~4 concrete choices (short label + one-line description, in the manager's language) so they can tap instead of type. Put your recommendation first. Leave "options" null when nothing needs deciding.
- Never fill "options" and "assignment" in the same turn: options mean you're still confirming what to do.
- Never invent facts about the company or your past work beyond what's listed above.`;

  const transcript = input.messages
    .slice(-HISTORY_LIMIT)
    .map((m) => `${m.role === "user" ? "Manager" : employee.name}: ${m.content}`)
    .join("\n\n");

  // 계량은 서비스 클라이언트로 — 장부(model_usage)는 사용자 세션이
  // 쓰는 테이블이 아니다. 소유 확인은 위에서 이미 사용자 세션이 했다.
  const providers = meterProviders(defaultProviders(), createServiceClient(), {
    companyId: companyEmployee.company_id,
    companyEmployeeId: companyEmployee.id,
  });

  const { output } = await providers.ai.generateStructuredOutput({
    systemInstructions,
    input: `# Conversation so far\n\n${transcript}\n\nRespond as ${employee.name}.`,
    schema: chatOutputSchema,
    schemaName: "employee_chat_turn",
    tier: "routine",
    maxTokens: 1200,
  });

  // ── 업무 접수 ────────────────────────────────────────────────────
  if (!output.assignment) {
    return { ok: true, reply: output.reply, assignment: null, options: output.options };
  }

  const created = await createAssignment(owned, {
    title: output.assignment.title,
    description: output.assignment.description,
    expectedOutcome: output.assignment.expectedOutcome ?? undefined,
    priority: "normal",
  });

  if ("error" in created && created.error) {
    // 접수 실패는 대화로 알린다. 모델의 답은 이미 접수를 약속했을 수
    // 있으므로 사실을 덧붙인다.
    return {
      ok: true,
      reply: `${output.reply}\n\n— but I couldn't actually take it on: ${created.error}`,
      assignment: null,
      options: null,
    };
  }

  const { assignmentId, queued } = created as { assignmentId: string; queued: boolean };

  // 바로 시작할 수 있으면 시작을 걸어 둔다 — 기다리지는 않는다.
  // 실행은 몇 분짜리고 대화는 지금 답해야 한다. 실행 상태는 업무
  // 페이지가 보여 주고, 실패해도 업무는 남아 재시도할 수 있다.
  if (!queued) {
    void import("@/lib/execution/service")
      .then(({ startExecution }) => startExecution(assignmentId))
      .catch(() => {});
  }

  return {
    ok: true,
    reply: output.reply,
    assignment: { id: assignmentId, title: output.assignment.title, queued },
    options: null,
  };
}
