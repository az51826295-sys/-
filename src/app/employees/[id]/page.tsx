import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import type { Employee } from "@/lib/types";
import { hireEmployee } from "./actions";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  const { data: employee } = await supabase
    .from("employees")
    .select("*")
    .eq("id", id)
    .maybeSingle<Employee>();

  if (!employee) {
    notFound();
  }

  const { data: hire } = await supabase
    .from("company_employees")
    .select("id")
    .eq("company_id", company.id)
    .eq("employee_id", employee.id)
    .maybeSingle();

  const isHired = Boolean(hire);
  const definition = getEmployeeDefinition(employee.slug);

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <div className="rounded-lg border border-zinc-200 p-8">
          <h1 className="text-2xl font-semibold text-zinc-900">{employee.name}</h1>
          <p className="mt-1 text-zinc-500">{employee.role}</p>

          <p className="mt-6 text-sm leading-relaxed text-zinc-700">
            {definition?.summary ?? employee.description}
          </p>

          {definition && (
            <div className="mt-6 rounded-lg bg-zinc-50 px-5 py-4">
              <p className="text-xs text-zinc-500">Delivers</p>
              <p className="mt-0.5 text-sm font-medium text-zinc-900">
                {definition.deliverable.label}
              </p>
            </div>
          )}

          {employee.responsibilities.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-medium text-zinc-900">
                What {employee.name} Can Do
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600">
                {employee.responsibilities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* The examples do more than illustrate: they are the fastest way to
              see whether this employee does the kind of work you need. */}
          {definition && definition.assignmentExamples.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-medium text-zinc-900">Example Assignments</h2>
              <ul className="mt-2 space-y-2">
                {definition.assignmentExamples.map((example) => (
                  <li
                    key={example.title}
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700"
                  >
                    {example.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-6">
            <div>
              <p className="text-xs text-zinc-500">Salary</p>
              <p className="text-lg font-semibold text-zinc-900">{employee.salary}</p>
            </div>

            {isHired ? (
              <span className="rounded-full bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
                Hired
              </span>
            ) : (
              <form action={hireEmployee}>
                <input type="hidden" name="employeeId" value={employee.id} />
                <button
                  type="submit"
                  className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Hire {employee.name}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
