import { redirect } from "next/navigation";
import Link from "next/link";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { NavBar } from "@/components/NavBar";
import { ensureOrganization, loadOrganization } from "@/lib/departments/service";
import { loadCompanyFacts } from "@/lib/company/report";

export default async function OrganizationPage() {
  const company = await getCompanyContext();
  if (!company) redirect("/company/new");

  // Reconciled on read, so somebody hired since the last visit appears in a
  // department rather than belonging nowhere.
  await ensureOrganization(company.supabase, company.companyId);
  const departments = await loadOrganization(company.supabase, company.companyId);
  const facts = await loadCompanyFacts();

  const employees = departments.reduce((sum, d) => sum + d.employeeCount, 0);
  const waiting = departments.reduce((sum, d) => sum + d.waitingCount, 0);

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">Organization</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {company.companyName ?? "Your company"} — how the work is divided up.
        </p>

        <dl className="mt-6 grid grid-cols-3 gap-3">
          {[
            { label: "Departments", value: departments.length },
            { label: "Employees", value: employees },
            { label: "Work waiting", value: waiting },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-zinc-200 px-4 py-3">
              <dt className="text-xs text-zinc-500">{item.label}</dt>
              <dd className="mt-1 text-xl font-semibold text-zinc-900">{item.value}</dd>
            </div>
          ))}
        </dl>

        {departments.length === 0 ? (
          <p className="mt-10 text-center text-sm text-zinc-500">
            Hire and train an employee, and their department appears here.
          </p>
        ) : (
          <>
            {/*
              The top of the chart.

              Without it this is a list of departments floating in space. An
              org chart's first job is to say who it all reports to, and in
              this company that is one person — which is worth seeing, because
              it is also the reason every approval waits on them.
            */}
            <div className="mt-8 flex flex-col items-center">
              <div className="rounded-lg border border-zinc-900 px-5 py-3 text-center">
                <p className="text-xs text-zinc-500">Owner</p>
                <p className="text-sm font-medium text-zinc-900">
                  {facts?.ownerLabel ?? "You"}
                </p>
              </div>
              <div className="h-4 w-px bg-zinc-300" />
            </div>

            <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
              <span>
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-500 align-middle" />
                free
              </span>
              <span>
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" />
                busy
              </span>
              <span>
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle" />
                needs you
              </span>
            </p>

            <ul className="space-y-3">
            {departments.map((department) => (
              <li key={department.id}>
                <Link
                  href={`/dashboard/departments/${department.id}`}
                  className="block rounded-lg border border-zinc-200 px-5 py-4 hover:bg-zinc-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-zinc-900">{department.name}</p>
                      {department.description && (
                        <p className="mt-0.5 text-sm text-zinc-600">
                          {department.description}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-sm text-zinc-500">
                      {department.employeeCount}{" "}
                      {department.employeeCount === 1 ? "employee" : "employees"}
                    </p>
                  </div>

                  <p className="mt-3 text-xs text-zinc-500">
                    {/* Said as a state of the department, not as metrics. */}
                    {department.readyCount > 0
                      ? `${department.readyCount} free`
                      : "Everyone busy"}
                    {department.activeAssignments > 0 &&
                      ` · ${department.activeAssignments} in progress`}
                    {department.waitingCount > 0 &&
                      ` · ${department.waitingCount} waiting to start`}
                  </p>

                  {/*
                    Who is actually in it.

                    This page said "Sales · 1 employee" and made the manager
                    click into each department to find out who that was. A
                    company of six across three departments is three clicks
                    away from the one question an org chart exists to answer:
                    who works here and where do they sit.

                    Drawn from the members already loaded for the counts, so
                    naming them costs nothing that was not already paid.
                  */}
                  {department.members.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {department.members.map((member) => (
                        <li
                          key={member.companyEmployeeId}
                          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5"
                        >
                          <span className="text-sm text-zinc-900">
                            {member.name}
                          </span>
                          <span className="ml-2 text-xs text-zinc-400">
                            {member.role}
                          </span>
                          <span
                            className={`ml-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                              member.workStatus === "ready"
                                ? "bg-green-500"
                                : member.workStatus === "blocked"
                                  ? "bg-red-500"
                                  : "bg-amber-500"
                            }`}
                            aria-label={
                              member.workStatus === "ready"
                                ? "free"
                                : member.workStatus === "blocked"
                                  ? "needs attention"
                                  : "busy"
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </Link>
              </li>
            ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
