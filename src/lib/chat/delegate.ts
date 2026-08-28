import type { Supabase } from "@/lib/execution/shared";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { capabilityCatalogue } from "@/lib/chat/companyService";
import { runChatTurn, type ChatOption } from "@/lib/chat/service";

/**
 * 능력 하나를 맡을 사람을 찾고, 없으면 뽑고, 일을 넘긴다.
 *
 * 전에는 "일상"과 "회사"가 따로 있어서, 사용자가 말을 걸기 전에 **자기 요청을
 * 먼저 분류**해야 했다. 그건 이 제품이 다른 곳에서 계속 없애 온 부담과 같은
 * 것이다 — 누구에게 맡길지 안 묻겠다면서, 어느 모드인지는 묻고 있었다.
 *
 * 그래서 모드를 없앴다. 대화는 하나이고, 시간이 드는 일이라고 판단되면 그때
 * 이 함수가 조용히 사람을 붙인다. 사용자는 그 경계를 몰라도 된다.
 */

export type Delegation = {
  hired: { name: string; why: string } | null;
  routedTo: { id: string; name: string } | null;
  assignment: { id: string; title: string; queued: boolean } | null;
  options: ChatOption[] | null;
  /** 담당자가 덧붙인 말. 접수 담당의 답 뒤에 잇는다. */
  tail: string | null;
  /** 넘기지 못한 이유. 넘겼으면 null. */
  why: string | null;
};

const NOTHING: Delegation = {
  hired: null,
  routedTo: null,
  assignment: null,
  options: null,
  tail: null,
  why: null,
};

export async function delegate(
  db: Supabase,
  companyId: string,
  capabilityId: string,
  reason: string | null,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<Delegation> {
  const matched = capabilityCatalogue().find((c) => c.capabilityId === capabilityId);
  // 모델이 지어낸 id 는 그냥 버린다. 답은 이미 나갔으므로 대화가 끊기지 않는다.
  if (!matched) return NOTHING;

  const { data: hires } = await db
    .from("company_employees")
    .select("id, onboarding_status, employees(slug, name)")
    .eq("company_id", companyId);

  type Hire = {
    id: string;
    onboarding_status: string;
    employees: { slug: string; name: string } | null;
  };
  const existing = ((hires ?? []) as unknown as Hire[]).find(
    (h) =>
      h.employees &&
      getEmployeeDefinition(h.employees.slug)?.skillId === matched.skillId,
  );

  let hireId = existing?.id ?? null;
  let hireName = existing?.employees?.name ?? "";
  let onboardingDone = existing?.onboarding_status === "completed";
  let hired: { name: string; why: string } | null = null;

  if (!hireId) {
    const { data: catalog } = await db.from("employees").select("id, slug, name");
    const candidate = ((catalog ?? []) as { id: string; slug: string; name: string }[])
      .find((e) => getEmployeeDefinition(e.slug)?.skillId === matched.skillId);
    if (!candidate) {
      return { ...NOTHING, why: `${matched.label} 을(를) 할 사람이 카탈로그에 없습니다.` };
    }
    const { data: created } = await db
      .from("company_employees")
      .insert({ company_id: companyId, employee_id: candidate.id })
      .select("id, onboarding_status")
      .maybeSingle();
    if (!created) return { ...NOTHING, why: "고용에 실패했습니다." };
    hireId = created.id as string;
    hireName = candidate.name;
    onboardingDone = (created.onboarding_status as string) === "completed";
    hired = { name: candidate.name, why: reason ?? matched.label };
  }

  // 회사 지식은 고용과 무관하게 공유되므로, 오늘 뽑은 사람도 아는 상태로
  // 시작한다. 개인에게 설문을 다시 시킬 이유가 없다.
  if (!onboardingDone) {
    await db
      .from("company_employees")
      .update({ onboarding_status: "completed" })
      .eq("id", hireId);
  }

  const turn = await runChatTurn({ companyEmployeeId: hireId, messages });
  if (!turn.ok) {
    // 접수는 됐고 넘기는 데서 막혔다. 답은 이미 나갔으므로 이유만 싣는다.
    return { ...NOTHING, hired, why: turn.error };
  }

  return {
    hired,
    routedTo: { id: hireId, name: hireName },
    assignment: turn.assignment,
    options: turn.options,
    tail: turn.reply?.trim() || null,
    why: null,
  };
}
