import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { getEmployeeDefinition, type OnboardingQuestion } from "@/lib/employees/definitions";
import { NavBar } from "@/components/NavBar";
import type { OnboardingAnswer } from "@/lib/types";
import { completeOnboardingAction } from "./actions";

/** One answer as the manager should read it back. Returns null when they left
 *  it blank, so the review shows what they said and not what they skipped. */
function renderAnswer(
  question: OnboardingQuestion,
  answer: OnboardingAnswer | undefined,
): string | string[] | null {
  if (!answer) return null;

  if (question.inputType === "number_range") {
    const range = answer.answer_json as { min?: number; max?: number } | null;
    if (!range || (range.min === undefined && range.max === undefined)) return null;
    if (range.min !== undefined && range.max !== undefined) {
      return `${range.min}–${range.max} employees`;
    }
    return range.min !== undefined
      ? `${range.min} employees or more`
      : `Up to ${range.max} employees`;
  }

  if (
    question.inputType === "list" ||
    question.inputType === "multi_select" ||
    question.inputType === "ranked_select"
  ) {
    const items = Array.isArray(answer.answer_json)
      ? (answer.answer_json as string[])
      : [];
    if (items.length === 0) return null;
    // A ranking is numbered, because its order is the answer.
    return question.inputType === "ranked_select"
      ? items.map((item, index) => `${index + 1}. ${item}`)
      : items;
  }

  return answer.answer_text?.trim() || null;
}

export default async function OnboardingReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyEmployeeId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { companyEmployeeId } = await params;
  const { error } = await searchParams;
  const owned = await getOwnedCompanyEmployee(companyEmployeeId);

  if (!owned) {
    notFound();
  }

  const { supabase, companyEmployee, employee } = owned;

  if (companyEmployee.onboarding_status === "not_started") {
    redirect(`/dashboard/employees/${companyEmployeeId}/onboarding`);
  }

  const { data: answerRows } = await supabase
    .from("employee_onboarding_answers")
    .select("*")
    .eq("company_employee_id", companyEmployee.id);

  const answers = new Map<string, OnboardingAnswer>();
  for (const row of (answerRows ?? []) as OnboardingAnswer[]) {
    answers.set(row.question_id, row);
  }

  const textOf = (questionId: string) => answers.get(questionId)?.answer_text?.trim() || null;

  const sections = [
    { label: "Company", value: textOf("what_company_does") },
    { label: "Customers", value: textOf("main_customers") },
    { label: "Problem", value: textOf("customer_problem") },
    { label: "Differentiation", value: textOf("differentiation") },
  ] as const;

  const additionalContext = textOf("additional_context");

  // Role answers are rendered from the employee's own question list rather than
  // a hardcoded set, so a new employee's questions show up here without this
  // page having to learn about them.
  const definition = getEmployeeDefinition(employee.slug);
  const roleAnswers = (definition?.onboardingQuestions ?? [])
    .filter((question) => question.category === "role")
    .map((question) => ({
      label: question.question,
      value: renderAnswer(question, answers.get(question.id)),
    }))
    .filter((entry) => entry.value !== null);

  const isCompleted = companyEmployee.onboarding_status === "completed";

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <p className="text-sm font-medium text-zinc-500">{employee.name}</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">
          Here&apos;s what I learned about your company.
        </h1>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="mt-8 space-y-6 rounded-lg border border-zinc-200 p-8">
          {sections.map(
            (section) =>
              section.value && (
                <div key={section.label}>
                  <h2 className="text-sm font-medium text-zinc-900">{section.label}</h2>
                  <p className="mt-1 text-sm text-zinc-600">{section.value}</p>
                </div>
              ),
          )}

          {roleAnswers.map((entry) => (
            <div key={entry.label}>
              <h2 className="text-sm font-medium text-zinc-900">{entry.label}</h2>
              {Array.isArray(entry.value) ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-zinc-600">
                  {entry.value.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-zinc-600">{entry.value}</p>
              )}
            </div>
          ))}

          {additionalContext && (
            <div>
              <h2 className="text-sm font-medium text-zinc-900">Additional Context</h2>
              <p className="mt-1 text-sm text-zinc-600">{additionalContext}</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Link
            href={`/dashboard/employees/${companyEmployeeId}/onboarding`}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Edit Answers
          </Link>

          {isCompleted ? (
            <Link
              href={`/dashboard/employees/${companyEmployeeId}`}
              className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              View {employee.name}
            </Link>
          ) : (
            <form action={completeOnboardingAction}>
              <input type="hidden" name="companyEmployeeId" value={companyEmployeeId} />
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Complete Onboarding
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
