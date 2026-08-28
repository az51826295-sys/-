import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { employeeSkillRegistry } from "@/lib/skills/registry";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import { meterProviders } from "@/lib/costs/meter";
import { defaultProviders } from "@/lib/execution/shared";
import { runChatTurn, type ChatOption } from "@/lib/chat/service";
import { speakerFor, speakerNote } from "@/lib/chat/persona";
import { learnFromChat } from "@/lib/chat/learnFromChat";

/**
 * 회사와의 대화 한 턴.
 *
 * 기존 채팅은 **이미 고용한 직원 한 명**과의 1:1 대화다. 매니저가 먼저
 * 카탈로그를 뒤져 누구를 뽑을지 정하고, 훈련을 시키고, 그 다음에야 말을 걸 수
 * 있다. 그건 도구를 쓰는 순서이지 사람에게 일을 맡기는 순서가 아니다.
 *
 * 여기서는 하나만 한다: **매니저는 필요한 것을 말하고, 회사가 누가 할지를
 * 정한다.** 아무도 없으면 뽑는다.
 *
 * 누구를 뽑을지는 **능력**으로 고른다 — 이름이 아니다. 기술 레지스트리가
 * 애초에 그렇게 생겼다("adding a colleague who can also qualify leads should
 * not require touching the code that asks"). 이 파일은 그 설계를 처음으로
 * 실제로 쓰는 곳이고, 그래서 새 직원이 늘어도 여기는 안 바뀐다.
 *
 * 티어는 `verification` 이다. 이 호출이 하는 일은 새로운 판단이 아니라
 * **이미 선언된 능력 목록에 요청을 맞추는 것**이라, 답이 증거 안에 있다.
 */

export type CompanyChatInput = {
  messages: { role: "user" | "assistant"; content: string }[];
};

export type CompanyChatResult =
  | {
      ok: true;
      reply: string;
      /** 이번 턴에 새로 뽑은 사람. 이미 있던 사람에게 넘겼으면 null. */
      hired: { name: string; why: string } | null;
      /** 일을 넘긴 상대. 잡담이면 null. */
      routedTo: { id: string; name: string } | null;
      assignment: { id: string; title: string; queued: boolean } | null;
      options: ChatOption[] | null;
      /** 뽑긴 했지만 아직 훈련이 안 끝나 일을 못 받는 경우. */
      needsOnboarding: { id: string; name: string } | null;
    }
  | { ok: false; error: string; status: number };

const routeSchema = z.object({
  /**
   * 매니저에게 하는 답. **그 자리에서 쓸 만해야 한다.**
   *
   * 처음 만들 때 이 자리는 "누구에게 맡길지 정했습니다" 같은 접수 확인이었다.
   * 그러면 첫 턴에 사용자가 받는 것이 절차뿐이고, 같은 질문을 ChatGPT에
   * 쳤을 때보다 **나쁘다** — 거기서는 즉시 답이 나온다.
   *
   * 우리 장점(회사를 안다, 검증한다, 없을 때도 일한다)은 전부 두 번째 요청부터
   * 나타난다. 그러니 첫 턴에서 지면 두 번째 턴을 볼 사람이 없다. 답을 먼저
   * 주고, 뽑고 배정하는 것은 그 뒤에 조용히 붙인다.
   */
  reply: z.string(),
  /**
   * 이 일을 할 수 있는 능력 id. 잡담·질문이면 null.
   *
   * 반드시 아래 목록에 있는 id 중 하나여야 한다. 없는 id를 지어내면
   * 라우팅이 조용히 빗나가므로 여기서 검사하고 버린다.
   */
  capabilityId: z.string().nullable(),
  /** 왜 그 능력인지 한 줄. 매니저가 읽고 틀렸다고 말할 수 있어야 한다. */
  why: z.string().nullable(),
});

/** 지금 회사가 부릴 수 있는 능력 전부. 레지스트리에서 그때그때 읽는다. */
function capabilityCatalogue() {
  return Object.values(employeeSkillRegistry).flatMap((skill) =>
    skill.capabilities.map((c) => ({
      capabilityId: c.id,
      skillId: skill.id,
      label: c.label,
      produces: c.produces,
    })),
  );
}

export async function runCompanyChatTurn(
  input: CompanyChatInput,
): Promise<CompanyChatResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in.", status: 401 };

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!company) {
    return { ok: false, error: "No company yet.", status: 409 };
  }
  const companyId = company.id as string;

  // 모델을 부르기 전의 한도 확인. 대화가 한도 밖으로 새는 구멍이 되면 안 된다.
  if (await blockedBySpendLimit(supabase, companyId)) {
    return {
      ok: true,
      reply:
        "지금은 이번 기간 지출 한도에 걸려 있어서 새 일을 시작할 수 없습니다. " +
        "한도가 리셋되면 바로 이어서 하겠습니다.",
      hired: null,
      routedTo: null,
      assignment: null,
      options: null,
      needsOnboarding: null,
    };
  }

  const speaker = await speakerFor(supabase);

  // **교육 설문을 하지 않는다.**
  //
  // 전에는 교육이 안 끝난 직원이 있으면 "회사가 뭘 하나요"부터 물었다. 매니저
  // 입장에서 그건 일을 맡기려다 숙제를 받은 것이고, 이미 여러 번 대답한
  // 이야기다. 그 답은 **대화 안에 이미 나온다** — 그래서 묻는 대신 줍는다
  // (`learnFromChat`).
  //
  // 새로 뽑은 사람은 회사 지식을 그대로 물려받으므로, 아무것도 안 물어도
  // 아는 상태로 시작한다.

  const lastUserSaid =
    [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const catalogue = capabilityCatalogue();
  // 계량은 세 인자다: 제공자 · DB · 범위. 대화 한 턴도 장부에 남아야
  // 지출 한도가 실제로 한도가 된다.
  const providers = meterProviders(defaultProviders(), supabase, { companyId });

  const { output } = await providers.ai.generateStructuredOutput({
    systemInstructions: [
      "너는 이 회사의 접수 담당이다. 두 가지를 **동시에** 한다.",
      "",
      "1) **지금 답한다.** 매니저가 물은 것에 그 자리에서 쓸 만한 답을 준다.",
      '   "담당자를 배정하겠습니다" 같은 접수 확인만 하고 끝내지 마라 —',
      "   그건 답이 아니라 절차이고, 매니저는 답을 물었다.",
      "2) 시간이 드는 일이면 아래 능력 목록에서 누가 할지 고른다.",
      "   한 번 답하고 끝날 질문이면 고르지 않는다(null).",
      "",
      "능력 목록:",
      catalogue
        .map((c) => `- ${c.capabilityId}: ${c.label} → ${c.produces}`)
        .join("\n"),
      "",
      "규칙:",
      "1. 목록에 있는 id만 쓴다. 맞는 것이 없으면 null 을 내고 무엇은 할 수",
      "   있는지 답에 적는다. **없는 능력을 있는 척하지 않는다.**",
      "2. 조사·검증·문서·그림처럼 시간이 드는 것일 때만 고른다.",
      "3. 한국어로 답한다. 길어야 하는 질문이면 길게 답해도 된다 —",
      "   짧게 자르는 것이 친절이 아니다.",
      speakerNote(speaker),
    ].join("\n"),
    input: input.messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
    schema: routeSchema,
    schemaName: "company_chat_route",
    // 답이 곧 사용자가 받는 물건이므로 깎지 않는다. 이 호출은 라우팅만 하는
    // 것이 아니라 **첫 답을 쓰는** 호출이다.
    maxTokens: 8000,
    tier: "judgment",
  });

  // 모델이 지어낸 id를 그대로 믿지 않는다. 목록에 없으면 잡담으로 떨어뜨린다.
  const matched = output.capabilityId
    ? catalogue.find((c) => c.capabilityId === output.capabilityId)
    : undefined;

  if (!matched) {
    return {
      ok: true,
      reply: output.reply,
      hired: null,
      routedTo: null,
      assignment: null,
      options: null,
      needsOnboarding: null,
    };
  }

  // 그 능력을 가진 직원이 이미 있는가.
  const { data: hires } = await supabase
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
    // 아무도 없으면 뽑는다. 카탈로그에서 그 기술을 가진 직원을 찾는다.
    const { data: catalog } = await supabase.from("employees").select("id, slug, name");
    const candidate = ((catalog ?? []) as { id: string; slug: string; name: string }[])
      .find((e) => getEmployeeDefinition(e.slug)?.skillId === matched.skillId);
    if (!candidate) {
      return {
        ok: true,
        reply:
          `${matched.label} 을(를) 할 사람이 아직 카탈로그에 없습니다. ` +
          `지금 할 수 있는 것은: ` +
          catalogue.map((c) => c.label).join(" · "),
        hired: null,
        routedTo: null,
        assignment: null,
        options: null,
        needsOnboarding: null,
      };
    }
    const { data: created } = await supabase
      .from("company_employees")
      .insert({ company_id: companyId, employee_id: candidate.id })
      .select("id, onboarding_status")
      .maybeSingle();
    if (!created) {
      return { ok: false, error: "고용에 실패했습니다.", status: 500 };
    }
    hireId = created.id as string;
    hireName = candidate.name;
    onboardingDone = (created.onboarding_status as string) === "completed";
    hired = { name: candidate.name, why: output.why ?? matched.label };
  }

  // 새로 뽑은 사람에게 설문을 시키지 않는다.
  //
  // 전에는 여기서 멈추고 "회사에 대해 몇 가지만 알려주세요" 했다. 그런데 회사
  // 지식은 **고용과 무관하게 회사 전체가 공유**하는 것이라, 오늘 아침 뽑은
  // 사람도 회사가 지금까지 배운 것을 그대로 물려받는다. 그 사람 개인에게 다시
  // 물을 이유가 없다.
  //
  // 회사가 아직 아무것도 모르는 상태라면 그건 이 사람의 문제가 아니라 회사가
  // 처음이라는 뜻이고, 대화가 이어지면서 채워진다.
  if (!onboardingDone) {
    await supabase
      .from("company_employees")
      .update({ onboarding_status: "completed" })
      .eq("id", hireId);
  }

  // 여기서부터는 기존 1:1 채팅이 그대로 한다 — 업무 접수, 배정 생성, 큐잉까지
  // 폼에서 만든 업무와 완전히 같은 경로를 탄다.
  const turn = await runChatTurn({
    companyEmployeeId: hireId,
    messages: input.messages,
  });
  if (!turn.ok) return turn;

  // 대화에서 회사 사실을 줍는다. **답을 낸 뒤에** 한다 — 이게 실패해도
  // 사용자는 답을 받아야 하고, 배우는 것은 그다음이다.
  try {
    await learnFromChat(supabase, providers, companyId, lastUserSaid);
  } catch {
    // 배우지 못한 것은 다음 턴에 다시 기회가 온다. 답을 삼킬 이유가 없다.
  }

  // 접수 담당의 답이 먼저다. 담당자가 덧붙인 말은 그 뒤에 잇는다 — 순서를
  // 뒤집으면 사용자가 처음 읽는 문장이 절차가 된다.
  const tail = turn.reply?.trim();
  return {
    ok: true,
    reply: tail && tail !== output.reply ? `${output.reply}

${tail}` : output.reply,
    hired,
    routedTo: { id: hireId, name: hireName },
    assignment: turn.assignment,
    options: turn.options,
    needsOnboarding: null,
  };
}
