import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";
import { ACTIVE_ASSIGNMENT_STATUSES } from "@/lib/assignments/service";
import { assignmentStatusLabel, formatAssignedDate } from "@/lib/assignments/labels";
import { labelForDeliverableType } from "@/lib/assignments/workforce";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import type { Assignment, Employee } from "@/lib/types";

const tabs = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
] as const;

const COMPLETED_STATUSES = ["submitted", "completed"];

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; employee?: string }>;
}) {
  const { status, employee: employeeFilter } = await searchParams;
  const activeTab = tabs.find((tab) => tab.key === status)?.key ?? "all";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Work one employee did for another is theirs, not the manager's. It shows up
  // on the parent assignment's collaboration section and nowhere else.
  let query = supabase
    .from("assignments")
    .select(
      "*, company_employees!assignments_company_employee_id_fkey(id, employees(name, role, slug))",
    )
    .eq("assignment_type", "manager")
    .order("assigned_at", { ascending: false });

  if (activeTab === "active") {
    query = query.in("status", [...ACTIVE_ASSIGNMENT_STATUSES]);
  } else if (activeTab === "completed") {
    query = query.in("status", COMPLETED_STATUSES);
  }

  const { data } = await query;

  const all = (data ?? []) as (Assignment & {
    company_employees: {
      id: string;
      employees: Pick<Employee, "name" | "role" | "slug">;
    };
  })[];

  // The employee filter is applied here rather than in the query so the tabs
  // above still show every employee who has assignments, not just the selected
  // one.
  const employeeOptions = [
    ...new Map(
      all
        .filter((assignment) => assignment.company_employees?.employees)
        .map((assignment) => [
          assignment.company_employees.employees.slug,
          assignment.company_employees.employees.name,
        ]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));

  const assignments = employeeFilter
    ? all.filter(
        (assignment) =>
          assignment.company_employees?.employees?.slug === employeeFilter,
      )
    : all;

  const tabHref = (tabKey: string) => {
    const query = new URLSearchParams();
    if (tabKey !== "all") query.set("status", tabKey);
    if (employeeFilter) query.set("employee", employeeFilter);
    const search = query.toString();
    return search ? `/dashboard/assignments?${search}` : "/dashboard/assignments";
  };

  const employeeHref = (slug: string | null) => {
    const query = new URLSearchParams();
    if (activeTab !== "all") query.set("status", activeTab);
    if (slug) query.set("employee", slug);
    const search = query.toString();
    return search ? `/dashboard/assignments?${search}` : "/dashboard/assignments";
  };

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">Assignments</h1>

        <div className="mt-6 flex gap-1 border-b border-zinc-200">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tabHref(tab.key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                activeTab === tab.key
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {employeeOptions.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={employeeHref(null)}
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
                href={employeeHref(slug)}
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

        {assignments.length === 0 ? (
          <div className="mt-10 text-center">
            <p className="font-medium text-zinc-900">No assignments yet.</p>
            <p className="mt-1 text-sm text-zinc-500">
              Your employees are ready when you are.
            </p>
            <Link
              href="/dashboard"
              className="mt-4 inline-block rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              View Workforce
            </Link>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {assignments.map((assignment) => {
              const employee = assignment.company_employees?.employees;
              return (
                <li key={assignment.id}>
                  <Link
                    href={`/dashboard/assignments/${assignment.id}`}
                    className="flex items-center justify-between px-5 py-4 hover:bg-zinc-50"
                  >
                    <div>
                      <p className="font-medium text-zinc-900">{assignment.title}</p>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {employee?.name} &middot; {employee?.role}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {labelForDeliverableType(
                          getEmployeeDefinition(employee?.slug ?? "")?.deliverable.type ??
                            "",
                        )}
                        {" · "}
                        Assigned {formatAssignedDate(assignment.assigned_at)}
                      </p>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                      {assignmentStatusLabel[assignment.status]}
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
