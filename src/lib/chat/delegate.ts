import type { Supabase } from "@/lib/execution/shared";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { capabilityCatalogue } from "@/lib/chat/companyService";
import { runChatTurn, type ChatOption } from "@/lib/chat/service";
import { retrieveCompanyKnowledge } from "@/lib/knowledge/retrieval";
import { releaseEmployee } from "@/lib/assignments/service";

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
  images: string[] = [],
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

  // **아는 것 없이 일하러 보내지 않는다.** 실행은 시작 전에 "회사가 무엇을 하고
  // 누구를 위해 어떤 문제를 푸는지" 가 그 사람의 지식 카드에 있는지 본다 —
  // 없으면 모델을 부르기 전에 멈춘다(CONTEXT_INCOMPLETE). 그 카드는 원래
  // 교육 설문(대시보드)이 채웠는데, 그 화면은 09-05 에 지웠다. 그러니 여기서
  // 대화가 가르친 것으로 채운다. 아직 아무것도 못 배웠으면 **모른다고 적는다** —
  // 그래야 그 사람이 지어내지 않고, 결과가 대화로 돌아왔을 때 매니저가
  // 한 줄 더 말해 주면 다음 판에는 그것이 실린다.
  await ensureKnowledgeProfile(db, companyId, hireId);

  // 실패한 채 / 넘긴 채 서 있는 옛 일을 접는다. 안 그러면 새 일은 대기열에
  // 들어가고, 대기열을 꺼내 줄 화면이 없어서 영영 안 시작된다(09-05 14:12).
  await releaseEmployee(db, hireId);

  const turn = await runChatTurn({ companyEmployeeId: hireId, messages, images });
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


const NOT_TOLD_YET =
  "매니저가 아직 말하지 않았습니다. 짐작하지 말고, 모르는 것은 모른다고 적고, " +
  "필요하면 결과에 물음을 남기십시오. 대화에서 알게 되면 다음 일에 반영됩니다.";

/**
 * 지식 카드가 없으면 대화가 가르친 것으로 만든다. 있으면 손대지 않는다 —
 * 매니저가 설문으로 채운 카드를 대화 요약이 덮어쓰면 아는 것이 줄어든다.
 */
async function ensureKnowledgeProfile(
  db: Supabase,
  companyId: string,
  companyEmployeeId: string,
): Promise<void> {
  const { data: have } = await db
    .from("employee_knowledge_profiles")
    .select("company_employee_id")
    .eq("company_employee_id", companyEmployeeId)
    .maybeSingle();
  if (have) return;

  const { data: company } = await db
    .from("companies")
    .select("name, website")
    .eq("id", companyId)
    .maybeSingle();
  const known = await retrieveCompanyKnowledge(db, companyId);
  const learned = known.map((k) => `- ${k.title}: ${k.description}`).join("\n");

  const companySummary =
    `회사 이름: ${company?.name ?? "(없음)"}` +
    (company?.website ? ` · ${company.website}` : "") +
    (learned ? `\n\n대화에서 알게 된 것:\n${learned}` : `\n\n${NOT_TOLD_YET}`);

  await db.from("employee_knowledge_profiles").insert({
    company_employee_id: companyEmployeeId,
    company_summary: companySummary,
    customer_summary: NOT_TOLD_YET,
    problem_summary: NOT_TOLD_YET,
    differentiation_summary: null,
    competitors: [],
    priorities: [],
    additional_context: null,
    role_knowledge_json: null,
  });
}
