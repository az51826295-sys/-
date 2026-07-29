import { redirect } from "next/navigation";
import Link from "next/link";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { NavBar } from "@/components/NavBar";
import { attentionLabel, attentionStateFor } from "@/lib/assignments/workforce";
import type { CompanyEmployee, Employee } from "@/lib/types";

export default async function NewRecurringAssignmentPage() {
  const company = await getCompanyContext();
  if (!company) redirect("/company/new");

  const { data: hireRows } = await company.supabase
    .from("company_employees")
    .select("*, employees(*)")
    .eq("company_id", company.companyId);

  const hires = (hireRows ?? []) as (CompanyEmployee & { employees: Employee })[];

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Who should do this regularly?
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pick the employee who will do the work each time.
        </p>

        {hires.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-500">
            You haven&apos;t hired any employees yet.{" "}
            <Link href="/employees" className="underline">
              Browse Employees
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-8 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {hires.map((hire) => {
              const isOnboarded = hire.onboarding_status === "completed";
              const state = attentionStateFor(hire, undefined, false);

              return (
                <li
                  key={hire.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <p className="font-medium text-zinc-900">{hire.employees.name}</p>
                    <p className="text-sm text-zinc-500">{hire.employees.role}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {attentionLabel[state]}
                    </p>
                  </div>

                  {/* Being busy right now is no reason not to schedule future
                      work — availability is checked when the time arrives. */}
                  {isOnboarded ? (
                    <Link
                      href={`/dashboard/employees/${hire.id}/assign/recurring`}
                      className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Schedule Work
                    </Link>
                  ) : (
                    <Link
                      href={`/dashboard/employees/${hire.id}`}
                      className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-50"
                    >
                      Continue Onboarding
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
