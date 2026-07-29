import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { getActiveAssignment } from "@/lib/assignments/service";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { NavBar } from "@/components/NavBar";
import { AssignWorkForm } from "./AssignWorkForm";

export default async function AssignWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyEmployeeId: string }>;
  searchParams: Promise<{ title?: string }>;
}) {
  const { companyEmployeeId } = await params;
  // Arrives when the manager clicked a next step at the bottom of a report.
  // A recommendation nobody can act on in one click is a recommendation that
  // gets read and forgotten.
  const { title: suggestedTitle } = await searchParams;
  const owned = await getOwnedCompanyEmployee(companyEmployeeId);

  if (!owned) {
    notFound();
  }

  const { companyEmployee, employee } = owned;

  // Gate on the server too — the workspace hides the button, but the URL is guessable.
  if (companyEmployee.onboarding_status !== "completed") {
    redirect(`/dashboard/employees/${companyEmployeeId}`);
  }

  // Somebody already working is not a reason to turn the manager away. It used
  // to be: this redirected them to whatever was running, which meant the thing
  // they had come here to write down was lost and they had to remember it
  // until the employee was free. The form still opens; the work goes behind
  // what is already on that person's desk.
  const active = await getActiveAssignment(owned);

  const definition = getEmployeeDefinition(employee.slug);

  // The role fields start from what the employee was taught, so the manager
  // sees their own criteria rather than an empty form.
  const { data: profile } = await owned.supabase
    .from("employee_knowledge_profiles")
    .select("role_knowledge_json")
    .eq("company_employee_id", companyEmployee.id)
    .maybeSingle();

  const roleKnowledge = profile?.role_knowledge_json as
    | { idealCustomerProfile?: Record<string, unknown>; buyingSignals?: string[] }
    | null;

  const roleDefaults = roleKnowledge
    ? { ...roleKnowledge.idealCustomerProfile, buyingSignals: roleKnowledge.buyingSignals }
    : {};

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Assign work to {employee.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Describe what you need {employee.name} to work on.
        </p>

        {/* Said before they write, not after they submit. Somebody who knows
            this will queue can still decide to give it to a colleague
            instead — after they have typed three paragraphs, that choice has
            already cost them something. */}
        {active && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-sm text-amber-900">
              {`${employee.name} is working on "${active.title}" right now. This goes behind it and starts on its own when that is approved.`}
            </p>
            <Link
              href={`/dashboard/assignments/${active.id}`}
              className="mt-1 inline-block text-xs text-amber-800 underline"
            >
              See what they&apos;re doing
            </Link>
          </div>
        )}

        {/* Offered up front rather than buried in the form: whether this is a
            one-off or a standing job changes what the manager writes. */}
        <div className="mt-6 rounded-lg border border-zinc-200 p-5">
          <p className="text-sm font-medium text-zinc-900">
            How often should this work happen?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-md border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
              Once
            </span>
            <Link
              href={`/dashboard/employees/${companyEmployee.id}/assign/recurring`}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Recurring
            </Link>
          </div>
        </div>

        <AssignWorkForm
          companyEmployeeId={companyEmployee.id}
          employeeName={employee.name}
          examples={definition?.assignmentExamples ?? []}
          suggestedTitle={suggestedTitle ?? ""}
          skillId={definition?.skillId ?? ""}
          roleDefaults={roleDefaults}
        />
      </main>
    </div>
  );
}
