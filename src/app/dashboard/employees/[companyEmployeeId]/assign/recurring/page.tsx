import { notFound, redirect } from "next/navigation";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { NavBar } from "@/components/NavBar";
import { RecurringForm } from "./RecurringForm";

export default async function RecurringAssignPage({
  params,
}: {
  params: Promise<{ companyEmployeeId: string }>;
}) {
  const { companyEmployeeId } = await params;
  const owned = await getOwnedCompanyEmployee(companyEmployeeId);

  if (!owned) {
    notFound();
  }

  const { companyEmployee, employee } = owned;

  // Gated on the server too: the workspace hides the link, but the URL is
  // guessable and an un-onboarded employee has nothing to work from.
  if (companyEmployee.onboarding_status !== "completed") {
    redirect(`/dashboard/employees/${companyEmployeeId}`);
  }

  const company = await getCompanyContext();
  if (!company) notFound();

  const definition = getEmployeeDefinition(employee.slug);

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
          Schedule recurring work for {employee.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {employee.name} will do this on a regular schedule without you asking
          each time.
        </p>

        <RecurringForm
          companyEmployeeId={companyEmployee.id}
          employeeName={employee.name}
          examples={definition?.assignmentExamples ?? []}
          skillId={definition?.skillId ?? ""}
          roleDefaults={roleDefaults}
          timezone={company.timezone}
        />
      </main>
    </div>
  );
}
