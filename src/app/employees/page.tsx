import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import type { Employee } from "@/lib/types";

/**
 * Who works here, and who could.
 *
 * This used to be one undifferentiated grid with a small "Hired" badge in the
 * corner of some cards, which meant the answer to "who works for me" was
 * something you had to assemble by scanning badges. A person's own staff and a
 * catalogue of strangers are not the same list, so they are no longer one.
 */
export default async function EmployeesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!company) {
    redirect("/company/new");
  }

  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .order("status", { ascending: false })
    .order("name");

  const { data: hires } = await supabase
    .from("company_employees")
    .select("id, employee_id, onboarding_status")
    .eq("company_id", company.id);

  // Keyed by the catalogue employee, so a card can link to the person rather
  // than back to the advert for them.
  const hiredById = new Map(
    (hires ?? []).map((hire) => [
      hire.employee_id as string,
      {
        companyEmployeeId: hire.id as string,
        onboarded: hire.onboarding_status === "completed",
      },
    ]),
  );

  const all = (employees as Employee[] | null) ?? [];
  const ours = all.filter((employee) => hiredById.has(employee.id));
  const hireable = all.filter((employee) => !hiredById.has(employee.id));

  function card(employee: Employee, hired: boolean, onboarded: boolean) {
    const definition = getEmployeeDefinition(employee.slug);
    const isAvailable = employee.status === "available";

    return (
      <div className="flex h-full flex-col rounded-lg border border-zinc-200 p-5 transition-colors hover:border-zinc-400">
        <h2 className="text-lg font-semibold text-zinc-900">{employee.name}</h2>
        <p className="mt-1 text-sm text-zinc-500">{employee.role}</p>

        <p className="mt-3 flex-1 text-sm text-zinc-600">
          {definition?.summary ?? employee.description}
        </p>

        {/* How they work, above what they deliver. Two people with the same job
            title do different work, and temperament is what turns "who can do
            this" into "who should". */}
        {definition && (
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs text-zinc-500">How they work</p>
              <p className="mt-0.5 text-sm text-zinc-700">
                {definition.workingStyle.headline}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Best for</p>
              <p className="mt-0.5 text-sm text-zinc-700">
                {definition.workingStyle.bestFor}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Delivers</p>
              <p className="text-sm font-medium text-zinc-900">
                {definition.deliverable.label}s
              </p>
            </div>
          </div>
        )}

        <span
          className={`mt-4 inline-block w-fit rounded-full px-2.5 py-1 text-xs font-medium ${
            hired
              ? onboarded
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-800"
              : isAvailable
                ? "bg-zinc-100 text-zinc-600"
                : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {hired
            ? onboarded
              ? "Ready for work"
              : "Still in training"
            : isAvailable
              ? "Available to hire"
              : "Coming Soon"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">Employees</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Who works for your company, and who you could hire next.
        </p>

        <h2 className="mt-10 text-sm font-medium text-zinc-900">
          Your employees
        </h2>
        {ours.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">
            Nobody works here yet. Hiring the first one takes a couple of
            minutes.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {ours.map((employee) => {
              const hire = hiredById.get(employee.id)!;
              return (
                <Link
                  key={employee.id}
                  href={`/dashboard/employees/${hire.companyEmployeeId}`}
                >
                  {card(employee, true, hire.onboarded)}
                </Link>
              );
            })}
          </div>
        )}

        <h2 className="mt-12 text-sm font-medium text-zinc-900">
          Available to hire
        </h2>
        {hireable.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">
            You have hired everyone available. More roles are on the way.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {hireable.map((employee) =>
              employee.status === "available" ? (
                <Link key={employee.id} href={`/employees/${employee.id}`}>
                  {card(employee, false, false)}
                </Link>
              ) : (
                <div key={employee.id} className="cursor-not-allowed opacity-70">
                  {card(employee, false, false)}
                </div>
              ),
            )}
          </div>
        )}
      </main>
    </div>
  );
}
