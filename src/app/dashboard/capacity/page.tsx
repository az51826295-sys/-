import { redirect } from "next/navigation";
import Link from "next/link";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { NavBar } from "@/components/NavBar";
import { readCapacity } from "@/lib/planning/capacity";

const STATE_LABEL: Record<string, string> = {
  free: "Free",
  working: "Working",
  blocked: "Blocked",
  waiting_on_you: "Waiting on you",
};

const STATE_CLASS: Record<string, string> = {
  free: "bg-green-50 text-green-700",
  working: "bg-blue-50 text-blue-700",
  blocked: "bg-amber-50 text-amber-800",
  waiting_on_you: "bg-amber-50 text-amber-800",
};

export default async function CapacityPage() {
  const company = await getCompanyContext();
  if (!company) redirect("/company/new");

  const reading = await readCapacity(company.supabase, company.companyId);

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">Where everyone is</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Who can take work right now, what is queued, and what is scheduled to
          arrive over the next {reading.forecastDays} days.
        </p>

        {reading.departments.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-600">
            No departments yet. Hire and train someone and they appear here.
          </p>
        ) : (
          <ul className="mt-8 space-y-3">
            {reading.departments.map((department) => {
              const members = reading.employees.filter(
                (employee) => employee.departmentId === department.departmentId,
              );
              const strained = reading.overCapacity.includes(department.departmentId);

              return (
                <li
                  key={department.departmentId}
                  className="rounded-lg border border-zinc-200 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        {department.name}
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-600">
                        {department.freeCount} of {department.memberCount} free
                        {department.queueSize > 0 &&
                          ` · ${department.queueSize} waiting`}
                        {department.forecastLoad > 0 &&
                          ` · ${department.forecastLoad} scheduled to arrive`}
                      </p>
                    </div>
                    {strained && (
                      <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                        Nobody free
                      </span>
                    )}
                  </div>

                  {members.length > 0 && (
                    <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-3">
                      {members.map((member) => (
                        <li
                          key={member.companyEmployeeId}
                          className="flex items-center justify-between gap-4"
                        >
                          <span className="text-sm text-zinc-700">{member.name}</span>
                          <span
                            className={`rounded-full px-3 py-0.5 text-xs font-medium ${STATE_CLASS[member.state]}`}
                          >
                            {STATE_LABEL[member.state]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-8 text-xs text-zinc-500">
          &quot;Free&quot; means they can accept work this minute. An employee here does
          one thing at a time, so this is a count of who is occupied rather than
          a productivity figure.
        </p>

        <div className="mt-6">
          <Link href="/dashboard/planning" className="text-sm text-zinc-600 underline">
            What to do about it
          </Link>
        </div>
      </main>
    </div>
  );
}
