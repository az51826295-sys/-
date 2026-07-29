import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { NavBar } from "@/components/NavBar";
import { loadOrganization } from "@/lib/departments/service";
import { formatAssignedDate } from "@/lib/assignments/labels";

const workStatusLabel: Record<string, string> = {
  ready: "Free",
  working: "Working",
  awaiting_review: "Waiting for your review",
  blocked: "Needs attention",
  needs_onboarding: "Still in training",
};

export default async function DepartmentPage({
  params,
}: {
  params: Promise<{ departmentId: string }>;
}) {
  const { departmentId } = await params;

  const company = await getCompanyContext();
  if (!company) redirect("/company/new");

  // Loaded through the same function the organisation view uses, so the two
  // can never disagree about how much a department is carrying.
  const departments = await loadOrganization(company.supabase, company.companyId);
  const department = departments.find((entry) => entry.id === departmentId);

  // Another company's department id simply isn't in this list.
  if (!department) notFound();

  // The foreign key is named explicitly: two of them run from assignments to
  // company_employees, and an unnamed embed is ambiguous — PostgREST resolves
  // it to nothing rather than erroring, so the section would just be silently
  // empty.
  const { data: assignmentRows } = await company.supabase
    .from("assignments")
    .select(
      "id, title, status, assigned_at, company_employees!assignments_company_employee_id_fkey(employees(name))",
    )
    .eq("department_id", departmentId)
    .order("assigned_at", { ascending: false })
    .limit(10);

  const assignments = (assignmentRows ?? []) as unknown as {
    id: string;
    title: string;
    status: string;
    assigned_at: string;
    company_employees: { employees: { name: string } } | null;
  }[];

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">{department.name}</h1>
        {department.description && (
          <p className="mt-1 text-sm text-zinc-600">{department.description}</p>
        )}

        <dl className="mt-6 grid grid-cols-3 gap-3">
          {[
            { label: "Employees", value: department.employeeCount },
            { label: "In progress", value: department.activeAssignments },
            { label: "Waiting to start", value: department.waitingCount },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-zinc-200 px-4 py-3">
              <dt className="text-xs text-zinc-500">{item.label}</dt>
              <dd className="mt-1 text-xl font-semibold text-zinc-900">{item.value}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-8">
          <h2 className="text-sm font-medium text-zinc-900">Who works here</h2>
          {department.members.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Nobody yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {department.members.map((member) => (
                <li
                  key={member.companyEmployeeId}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{member.name}</p>
                    <p className="mt-0.5 text-sm text-zinc-500">{member.role}</p>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {workStatusLabel[member.workStatus] ?? member.workStatus}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {assignments.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-medium text-zinc-900">Recent work</h2>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {assignments.map((assignment) => (
                <li key={assignment.id} className="px-5 py-4">
                  <p className="text-sm text-zinc-900">{assignment.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {assignment.company_employees?.employees?.name ?? "An employee"} ·{" "}
                    {formatAssignedDate(assignment.assigned_at)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8">
          <Link href="/dashboard/organization" className="text-sm text-zinc-600 underline">
            Back to organization
          </Link>
        </div>
      </main>
    </div>
  );
}
