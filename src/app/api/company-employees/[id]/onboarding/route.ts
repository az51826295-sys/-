import { NextResponse } from "next/server";
import { getOnboardingQuestions, getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import type { OnboardingAnswer } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owned = await getOwnedCompanyEmployee(id);

  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { supabase, companyEmployee, employee } = owned;
  const questions = getOnboardingQuestions(employee);

  const { data: answerRows } = await supabase
    .from("employee_onboarding_answers")
    .select("*")
    .eq("company_employee_id", companyEmployee.id);

  const answers: Record<string, { text: string | null; json: unknown }> = {};
  for (const row of (answerRows ?? []) as OnboardingAnswer[]) {
    answers[row.question_id] = { text: row.answer_text, json: row.answer_json };
  }

  return NextResponse.json({
    employee: {
      id: employee.id,
      slug: employee.slug,
      name: employee.name,
      role: employee.role,
    },
    onboardingStatus: companyEmployee.onboarding_status,
    currentQuestionId: companyEmployee.current_question_id,
    questions,
    answers,
  });
}
