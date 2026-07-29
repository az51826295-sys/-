import { redirect } from "next/navigation";
import Link from "next/link";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { NavBar } from "@/components/NavBar";
import { describeSchedule } from "@/lib/schedule/recurrence";
import { formatInZone } from "@/lib/schedule/time";
import { scheduleOf } from "@/lib/recurring/service";
import {
  recurringStatusClass,
  recurringStatusLabel,
  type RecurringAssignmentRow,
  type RecurringStatus,
} from "@/lib/recurring/types";
import type { Employee } from "@/lib/types";

const tabs = [
  { key: "all", label: "All", status: null },
  { key: "active", label: "Active", status: "active" },
  { key: "paused", label: "Paused", status: "paused" },
  { key: "ended", label: "Ended", status: "ended" },
] as const;

const emptyCopy: Record<string, string> = {
  all: "No recurring assignments yet.",
  active: "No active recurring assignments.",
  paused: "No paused recurring assignments.",
  ended: "No ended recurring assignments.",
};

export default async function RecurringAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; employee?: string }>;
}) {
  const { status, employee: employeeFilter } = await searchParams;
  const tab = tabs.find((entry) => entry.key === status) ?? tabs[0];

  const company = await getCompanyContext();
  if (!company) redirect("/company/new");

  let query = company.supabase
    .from("recurring_assignments")
    .select("*, company_employees(id, employees(name, role, slug))")
    .order("created_at", { ascending: false });

  if (tab.status) query = query.eq("status", tab.status);

  const { data } = await query;

  const all = (data ?? []) as (RecurringAssignmentRow & {
    company_employees: {
      id: string;
      employees: Pick<Employee, "name" | "role" | "slug">;
    };
  })[];

  // Filtered here rather than in the query so the employee chips still list
  // everyone with a schedule, not just the one currently selected.
  const employeeOptions = [
    ...new Map(
      all
        .filter((row) => row.company_employees?.employees)
        .map((row) => [
          row.company_employees.employees.slug,
          row.company_employees.employees.name,
        ]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));

  const rows = employeeFilter
    ? all.filter((row) => row.company_employees?.employees?.slug === employeeFilter)
    : all;

  const href = (statusKey: string, slug: string | null) => {
    const query = new URLSearchParams();
    if (statusKey !== "all") query.set("status", statusKey);
    if (slug) query.set("employee", slug);
    const search = query.toString();
    return search
      ? `/dashboard/recurring-assignments?${search}`
      : "/dashboard/recurring-assignments";
  };

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Recurring Assignments
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Work your employees complete on a regular schedule.
            </p>
          </div>
          <Link
            href="/dashboard/recurring-assignments/new"
            className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Schedule Work
          </Link>
        </div>

        <div className="mt-6 flex gap-1 border-b border-zinc-200">
          {tabs.map((entry) => (
            <Link
              key={entry.key}
              href={href(entry.key, employeeFilter ?? null)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                tab.key === entry.key
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {entry.label}
            </Link>
          ))}
        </div>

        {employeeOptions.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={href(tab.key, null)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                !employeeFilter
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              All Employees
            </Link>
            {employeeOptions.map(([slug, name]) => (
              <Link
                key={slug}
                href={href(tab.key, slug)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                  employeeFilter === slug
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {name}
              </Link>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="mt-10 text-center">
            <p className="font-medium text-zinc-900">{emptyCopy[tab.key]}</p>
            {tab.key === "all" && (
              <>
                <p className="mt-1 text-sm text-zinc-500">
                  Schedule regular work for your employees so important tasks
                  happen consistently.
                </p>
                <Link
                  href="/dashboard/recurring-assignments/new"
                  className="mt-4 inline-block rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Create Recurring Assignment
                </Link>
              </>
            )}
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {rows.map((row) => {
              const employee = row.company_employees?.employees;
              return (
                <li key={row.id}>
                  <Link
                    href={`/dashboard/recurring-assignments/${row.id}`}
                    className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-zinc-50"
                  >
                    <div>
                      <p className="font-medium text-zinc-900">{row.title}</p>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {employee?.name} &middot; {employee?.role}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {describeSchedule(scheduleOf(row))}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {row.next_run_at
                          ? `Next assignment ${formatInZone(new Date(row.next_run_at), row.timezone)}`
                          : row.status === "paused"
                            ? "No assignment is scheduled while paused."
                            : "This recurring assignment has ended."}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${recurringStatusClass[row.status as RecurringStatus]}`}
                    >
                      {recurringStatusLabel[row.status as RecurringStatus]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
