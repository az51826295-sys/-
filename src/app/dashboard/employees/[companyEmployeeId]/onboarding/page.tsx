import { notFound, redirect } from "next/navigation";
import { getOnboardingQuestions, getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { startOnboarding } from "@/lib/onboarding/service";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { NavBar } from "@/components/NavBar";
import { OnboardingInterview } from "./OnboardingInterview";
import type { OnboardingAnswer } from "@/lib/types";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ companyEmployeeId: string }>;
}) {
  const { companyEmployeeId } = await params;
  const owned = await getOwnedCompanyEmployee(companyEmployeeId);

  if (!owned) {
    notFound();
  }

  const { supabase, companyEmployee, employee } = owned;

  if (companyEmployee.onboarding_status === "completed") {
    redirect(`/dashboard/employees/${companyEmployeeId}`);
  }

  if (companyEmployee.onboarding_status === "not_started") {
    await startOnboarding(owned);
  }

  const definition = getEmployeeDefinition(employee.slug);
  const questions = getOnboardingQuestions(employee);

  const { data: answerRows } = await supabase
    .from("employee_onboarding_answers")
    .select("*")
    .eq("company_employee_id", companyEmployee.id);

  const initialAnswers: Record<string, { text: string | null; json: unknown }> = {};
  for (const row of (answerRows ?? []) as OnboardingAnswer[]) {
    initialAnswers[row.question_id] = { text: row.answer_text, json: row.answer_json };
  }

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <OnboardingInterview
          companyEmployeeId={companyEmployee.id}
          employeeName={employee.name}
          greeting={definition?.greeting ?? `Hi, I'm ${employee.name}.`}
          questions={questions}
          initialAnswers={initialAnswers}
          initialCurrentQuestionId={companyEmployee.current_question_id}
        />
      </main>
    </div>
  );
}
