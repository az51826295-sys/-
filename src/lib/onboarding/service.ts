import { getOnboardingQuestions, type OwnedCompanyEmployee } from "@/lib/onboarding/access";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { buildRoleKnowledge } from "@/lib/onboarding/roleKnowledge";
import { validateRoleKnowledge } from "@/lib/roles/schemas";
import type { OnboardingAnswer } from "@/lib/types";

export type ServiceResult<T = { ok: true }> = T | { error: string; status: number };

export async function startOnboarding(owned: OwnedCompanyEmployee): Promise<ServiceResult> {
  const { supabase, companyEmployee, employee } = owned;

  if (companyEmployee.onboarding_status === "completed") {
    return { error: `${employee.name} has already completed onboarding.`, status: 409 };
  }

  if (companyEmployee.onboarding_status === "not_started") {
    const questions = getOnboardingQuestions(employee);
    const { error } = await supabase
      .from("company_employees")
      .update({
        onboarding_status: "in_progress",
        onboarding_started_at: new Date().toISOString(),
        current_question_id: questions[0]?.id ?? null,
      })
      .eq("id", companyEmployee.id);

    if (error) return { error: error.message, status: 500 };
  }

  return { ok: true };
}

export async function saveOnboardingAnswer(
  owned: OwnedCompanyEmployee,
  input: { questionId: string; answer: unknown; currentQuestionId?: string },
): Promise<ServiceResult> {
  const { supabase, companyEmployee, employee } = owned;

  if (companyEmployee.onboarding_status === "completed") {
    return { error: `${employee.name} has already completed onboarding.`, status: 409 };
  }

  const question = getOnboardingQuestions(employee).find((q) => q.id === input.questionId);
  if (!question) {
    return { error: "Unknown question.", status: 400 };
  }

  const { answer } = input;

  if (question.required) {
    const isEmpty =
      answer === undefined ||
      answer === null ||
      (typeof answer === "string" && answer.trim().length === 0) ||
      (Array.isArray(answer) && answer.length === 0);

    if (isEmpty) {
      return { error: "Please answer this question before continuing.", status: 400 };
    }

    if (
      question.minLength &&
      typeof answer === "string" &&
      answer.trim().length < question.minLength
    ) {
      return { error: `Please write at least ${question.minLength} characters.`, status: 400 };
    }
  }

  // Anything that isn't a single piece of prose is stored as JSON, so a range
  // stays a range and a ranking keeps its order.
  const isStructured =
    question.inputType === "multi_select" ||
    question.inputType === "list" ||
    question.inputType === "ranked_select" ||
    question.inputType === "number_range";

  if (question.inputType === "number_range") {
    const rangeError = validateRange(answer);
    if (rangeError) return { error: rangeError, status: 400 };
  }

  const { error: answerError } = await supabase.from("employee_onboarding_answers").upsert(
    {
      company_employee_id: companyEmployee.id,
      question_id: question.id,
      question_category: question.category,
      answer_text: isStructured ? null : ((answer as string | null) ?? null),
      answer_json: isStructured ? (answer ?? (question.inputType === "number_range" ? {} : [])) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_employee_id,question_id" },
  );

  if (answerError) {
    return { error: "I couldn't save your answer.", status: 500 };
  }

  if (input.currentQuestionId) {
    await supabase
      .from("company_employees")
      .update({ current_question_id: input.currentQuestionId })
      .eq("id", companyEmployee.id);
  }

  return { ok: true };
}

/** A size range where the floor is above the ceiling is a typo, not a filter —
 *  saving it would silently exclude every company. */
function validateRange(answer: unknown): string | null {
  if (answer === null || answer === undefined) return null;
  if (typeof answer !== "object") return "Enter company sizes as numbers.";

  const value = answer as { min?: unknown; max?: unknown };
  const min = value.min;
  const max = value.max;

  for (const bound of [min, max]) {
    if (bound === undefined || bound === null) continue;
    if (typeof bound !== "number" || !Number.isFinite(bound) || bound < 0) {
      return "Enter company sizes as whole numbers.";
    }
  }

  if (typeof min === "number" && typeof max === "number" && min > max) {
    return "The smallest company size must not be larger than the largest.";
  }
  return null;
}

export async function completeOnboarding(owned: OwnedCompanyEmployee): Promise<ServiceResult> {
  const { supabase, companyEmployee, employee } = owned;

  if (companyEmployee.onboarding_status === "completed") {
    return { error: `${employee.name} has already completed onboarding.`, status: 409 };
  }

  const questions = getOnboardingQuestions(employee);

  const { data: answerRows } = await supabase
    .from("employee_onboarding_answers")
    .select("*")
    .eq("company_employee_id", companyEmployee.id);

  const answers = new Map<string, OnboardingAnswer>();
  for (const row of (answerRows ?? []) as OnboardingAnswer[]) {
    answers.set(row.question_id, row);
  }

  const missing = questions.filter((q) => q.required && !answers.has(q.id));
  if (missing.length > 0) {
    return { error: "Please answer this question before continuing.", status: 400 };
  }

  const textOf = (questionId: string) => answers.get(questionId)?.answer_text ?? null;
  const listOf = (questionId: string): string[] => {
    const value = answers.get(questionId)?.answer_json;
    return Array.isArray(value) ? (value as string[]) : [];
  };

  const definition = getEmployeeDefinition(employee.slug);
  if (!definition) {
    return { error: "This employee isn't available.", status: 400 };
  }

  // Validated before it is stored, always. A malformed ideal customer profile
  // would otherwise be replayed into every lead search this employee ever runs.
  const roleKnowledge = buildRoleKnowledge(definition, answers);
  const validation = validateRoleKnowledge(
    definition.roleKnowledgeSchemaId,
    roleKnowledge,
  );
  if (!validation.ok) {
    return { error: validation.error, status: 400 };
  }

  const { error: profileError } = await supabase.from("employee_knowledge_profiles").upsert(
    {
      company_employee_id: companyEmployee.id,
      company_summary: textOf("what_company_does"),
      customer_summary: textOf("main_customers"),
      problem_summary: textOf("customer_problem"),
      differentiation_summary: textOf("differentiation"),
      competitors: listOf("competitors"),
      priorities: listOf("monitoring_priorities"),
      additional_context: textOf("additional_context"),
      role_knowledge_json: validation.value,
      role_knowledge_schema_id: definition.roleKnowledgeSchemaId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_employee_id" },
  );

  if (profileError) return { error: profileError.message, status: 500 };

  const { error: statusError } = await supabase
    .from("company_employees")
    .update({
      onboarding_status: "completed",
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", companyEmployee.id);

  if (statusError) return { error: statusError.message, status: 500 };

  return { ok: true };
}
