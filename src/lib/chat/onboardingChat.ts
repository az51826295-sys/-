import { z } from "zod";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { getOnboardingQuestions } from "@/lib/onboarding/access";
import {
  completeOnboarding,
  saveOnboardingAnswer,
  startOnboarding,
} from "@/lib/onboarding/service";
import { meterProviders } from "@/lib/costs/meter";
import { defaultProviders } from "@/lib/execution/shared";

/**
 * 교육을 대화 안에서 한다.
 *
 * 지금까지 새 직원을 뽑으면 서식이 열렸다 — 질문 여남은 개가 한 화면에 있고,
 * 다 채워야 그 사람이 일을 받는다. 매니저 입장에서 그건 **일을 맡기려다 숙제를
 * 받은 것**이고, 특히 폰에서는 채우다 그만두기 쉽다.
 *
 * 그런데 그 질문들은 원래 대화에 어울리는 것들이다 — "회사가 뭘 하나요",
 * "고객이 누구인가요". 한 번에 하나씩 물으면 서식이 아니라 그냥 이야기다.
 *
 * **질문 목록은 바꾸지 않는다.** 같은 질문, 같은 저장 경로(`saveOnboardingAnswer`)
 * 를 쓴다 — 서식으로 채운 것과 대화로 채운 것이 다른 물건이 되면 안 된다.
 * 바뀌는 것은 묻는 방식뿐이다.
 *
 * 모델이 하는 일은 둘이다: 사람이 한 말에서 **답을 뽑아내는 것**, 그리고 다음
 * 질문을 **그 사람 말투에 맞춰 다시 쓰는 것**. 판단은 하지 않으므로 싼 등급이다.
 */

export type OnboardingTurn = {
  /** 매니저에게 할 말 — 다음 질문이거나 마쳤다는 인사. */
  reply: string;
  /** 방금 저장한 것. 없으면 아직 못 알아들은 것이다. */
  saved: { questionId: string; answer: string } | null;
  /** 남은 질문 수. 끝을 보여 주면 사람이 계속한다. */
  remaining: number;
  done: boolean;
};

const extract = z.object({
  /**
   * 사람이 방금 한 말에서 이번 질문의 답을 뽑아낸 것.
   *
   * 답이 안 들어 있으면 null 이다. **지어내지 않는다** — 회사에 대한 사실이
   * 지어내진 채로 저장되면 그 뒤 모든 일이 그 위에서 돈다.
   */
  answer: z.string().nullable(),
  /** 다음에 할 말. 질문이거나, 못 알아들었으면 다시 묻는 말. */
  reply: z.string(),
});

export async function onboardingTurn(
  companyEmployeeId: string,
  message: string,
): Promise<OnboardingTurn | { error: string; status: number }> {
  const owned = await getOwnedCompanyEmployee(companyEmployeeId);
  if (!owned) return { error: "Employee not found.", status: 404 };
  const { supabase, companyEmployee, employee } = owned;

  if (companyEmployee.onboarding_status === "not_started") {
    await startOnboarding(owned);
  }

  const questions = getOnboardingQuestions(employee);

  // 이미 답한 것은 다시 묻지 않는다 — **회사 전체에서**.
  //
  // 답은 고용 건에 묶여 저장된다. 그래서 처음에는 이 직원의 답만 봤는데,
  // 그러면 "회사가 뭘 하나요"를 사람 뽑을 때마다 다시 묻는다. 직원이 셋이면
  // 같은 질문을 세 번 하는 셈이고, 매니저 입장에서 그건 회사가 자기 회사를
  // 기억 못 하는 것으로 보인다.
  //
  // 역할 질문(`category: "role"`)은 사람마다 다르므로 그대로 각자 묻는다.
  // 회사 질문은 회사에 한 번이면 된다.
  const { data: hires } = await supabase
    .from("company_employees")
    .select("id")
    .eq("company_id", companyEmployee.company_id);
  const hireIds = ((hires ?? []) as { id: string }[]).map((h) => h.id);

  const { data: answered } = await supabase
    .from("employee_onboarding_answers")
    .select("question_id, question_category, company_employee_id")
    .in("company_employee_id", hireIds.length ? hireIds : [companyEmployeeId]);

  type Answer = {
    question_id: string;
    question_category: string;
    company_employee_id: string;
  };
  const rows = (answered ?? []) as Answer[];

  const answeredByCompany = new Set(
    rows.filter((a) => a.question_category === "company").map((a) => a.question_id),
  );
  const answeredByThisHire = new Set(
    rows
      .filter((a) => a.company_employee_id === companyEmployeeId)
      .map((a) => a.question_id),
  );

  const unanswered = questions.filter((q) =>
    q.category === "company"
      ? !answeredByCompany.has(q.id)
      : !answeredByThisHire.has(q.id),
  );

  // **필수만 묻는다.**
  //
  // 선택 질문까지 다 채워야 일을 받을 수 있게 해 두면, 매니저는 일을 맡기려다
  // 설문을 끝까지 하게 된다. 선택이라고 적어 놓고 필수처럼 굴면 그건 선택이
  // 아니다. 나중에 알려 주시면 그때 반영되고, 모르는 채로도 일은 시작된다.
  const pending = unanswered.filter((q) => q.required);

  if (pending.length === 0) {
    await completeOnboarding(owned);
    const later = unanswered.length;
    return {
      reply:
        `다 됐습니다. ${employee.name} 이(가) 이제 일을 받을 수 있습니다.` +
        (later > 0
          ? ` (나중에 알려 주시면 좋은 것이 ${later}가지 더 있지만, 없어도 일합니다.)`
          : ""),
      saved: null,
      remaining: 0,
      done: true,
    };
  }

  const current = pending[0];
  const providers = meterProviders(defaultProviders(), supabase, {
    companyId: companyEmployee.company_id,
    companyEmployeeId,
  });

  const { output } = await providers.ai.generateStructuredOutput({
    systemInstructions:
      `너는 새로 합류한 ${employee.name} 이고, 회사에 대해 배우는 중이다.\n\n` +
      `지금 알아야 하는 것: "${current.question}"` +
      (current.description ? `\n(뜻: ${current.description})` : "") +
      "\n\n" +
      "매니저가 방금 한 말에 그 답이 들어 있으면 `answer` 에 정리해 담는다. " +
      "**없으면 null 이다 — 지어내지 마라.** 회사에 대한 사실이 지어내진 채로 " +
      "저장되면 그 뒤 모든 일이 그 위에서 돈다.\n\n" +
      "`reply` 에는 다음에 할 말을 쓴다. 답을 받았으면 짧게 받아 적었다고 하고 " +
      (pending.length > 1
        ? `다음 질문 "${pending[1].question}" 을(를) 자연스럽게 묻는다.`
        : "이제 다 됐다고 말한다.") +
      " 못 알아들었으면 되묻는다. 한국어로, 한두 문장으로.",
    input: message,
    schema: extract,
    schemaName: "onboarding_extract",
    maxTokens: 2000,
    // 판단이 아니라 방금 들은 말에서 답을 꺼내는 일이다.
    tier: "routine",
  });

  let saved: { questionId: string; answer: string } | null = null;
  if (output.answer && output.answer.trim()) {
    const result = await saveOnboardingAnswer(owned, {
      questionId: current.id,
      answer: output.answer,
    });
    if (!("error" in result)) {
      saved = { questionId: current.id, answer: output.answer };
    }
  }

  const remaining = pending.length - (saved ? 1 : 0);
  if (remaining === 0) {
    await completeOnboarding(owned);
  }

  return {
    reply: output.reply,
    saved,
    remaining,
    done: remaining === 0,
  };
}
