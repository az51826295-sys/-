import Link from "next/link";
import { employeeDefinitions } from "@/lib/employees/definitions";

/**
 * Who you can actually hire, read from the registry rather than listed here.
 *
 * This page previously carried its own hardcoded list, and it drifted: it was
 * still advertising Emma as a content marketer and a third employee who was
 * never built. A landing page that promises people who do not exist is the one
 * kind of stale copy that costs a signup, so it reads from the same place the
 * hiring flow does.
 */
const employeePreview = employeeDefinitions.map((definition) => ({
  name: definition.name,
  role: definition.role,
  summary: definition.summary,
}));

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-sm font-semibold text-zinc-900">Rookery</span>
        <Link href="/login" className="text-sm text-zinc-600 hover:text-zinc-900">
          Log in
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
          Don&apos;t buy software. Hire employees.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-zinc-500">
          Rookery gives you a team of AI employees who work for your
          company&mdash;not another dashboard to babysit.
        </p>
        <Link
          href="/signup"
          className="mt-8 rounded-md bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Hire Your First Employee
        </Link>
      </section>

      {/* Why AI Employees */}
      <section className="border-t border-zinc-100 bg-zinc-50 px-6 py-20">
        <div className="mx-auto grid w-full max-w-4xl gap-8 sm:grid-cols-3">
          <div>
            <h3 className="font-semibold text-zinc-900">Not a tool. A teammate.</h3>
            <p className="mt-2 text-sm text-zinc-500">
              Each AI employee owns a role, not a feature list.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900">Works while you don&apos;t</h3>
            <p className="mt-2 text-sm text-zinc-500">
              No prompting required&mdash;your employees do their job on their own.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900">Hire, don&apos;t configure</h3>
            <p className="mt-2 text-sm text-zinc-500">
              Onboard a new employee in minutes, not a new integration.
            </p>
          </div>
        </div>
      </section>

      {/* Employee Preview */}
      <section className="px-6 py-20">
        <div className="mx-auto w-full max-w-4xl">
          <h2 className="text-center text-2xl font-semibold text-zinc-900">
            Meet your future team
          </h2>
          {/* Two columns rather than three: the grid used to hold a placeholder
              to fill the row, and an empty box invented an employee. */}
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {employeePreview.map((employee) => (
              <div
                key={employee.name}
                className="flex flex-col rounded-lg border border-zinc-200 p-5"
              >
                <h3 className="text-lg font-semibold text-zinc-900">
                  {employee.name}
                </h3>
                <p className="mt-1 text-sm text-zinc-500">{employee.role}</p>
                <p className="mt-3 text-sm text-zinc-600">{employee.summary}</p>
                <span className="mt-4 inline-block w-fit rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                  Available to hire
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-zinc-100 px-6 py-20 text-center">
        <h2 className="text-2xl font-semibold text-zinc-900">
          Ready to build your Rookery?
        </h2>
        <Link
          href="/signup"
          className="mt-6 inline-block rounded-md bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Hire Your First Employee
        </Link>
      </section>
    </div>
  );
}
