import { notFound } from "next/navigation";
import Link from "next/link";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { getActiveAssignment } from "@/lib/assignments/service";
import { workStatusLabel, formatAssignedDate } from "@/lib/assignments/labels";
import { progressSteps } from "@/lib/assignments/progress";
import { NavBar } from "@/components/NavBar";
import { loadTrackRecord, MIN_FOR_RATE } from "@/lib/employees/trackRecord";
import { describeSchedule } from "@/lib/schedule/recurrence";
import { scheduleOf } from "@/lib/recurring/service";
import {
  recurringStatusLabel,
  type RecurringAssignmentRow,
} from "@/lib/recurring/types";
import type { Deliverable } from "@/lib/types";
import { startOnboardingAction } from "./actions";

/**
 * The two or three facts that tell the manager whether this employee is
 * actually equipped to work. Per-role, because "trained" means something
 * different for an analyst than for a sales rep.
 */
function buildRoleFacts(
  slug: string,
  isOnboarded: boolean,
  roleKnowledge: unknown,
): { label: string; value: string }[] {
  if (slug !== "emma") {
    return [
      {
        label: "Company Knowledge",
        value: isOnboarded ? "Completed" : "Not completed",
      },
    ];
  }

  const knowledge = roleKnowledge as
    | { buyerRoles?: string[]; buyingSignals?: string[] }
    | null;

  const count = (items: string[] | undefined, noun: string) => {
    const total = items?.length ?? 0;
    return total === 0 ? "None yet" : `${total} ${noun}${total === 1 ? "" : "s"}`;
  };

  return [
    {
      label: "Ideal Customer Profile",
      value: isOnboarded ? "Completed" : "Not completed",
    },
    { label: "Buyer Roles", value: count(knowledge?.buyerRoles, "role") },
    { label: "Buying Signals", value: count(knowledge?.buyingSignals, "signal") },
  ];
}

export default async function EmployeeWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ companyEmployeeId: string }>;
  searchParams: Promise<{ completed?: string; assigned?: string }>;
}) {
  const { companyEmployeeId } = await params;
  const { completed, assigned } = await searchParams;
  const owned = await getOwnedCompanyEmployee(companyEmployeeId);

  if (!owned) {
    notFound();
  }

  const { supabase, companyEmployee, employee } = owned;
  const isOnboarded = companyEmployee.onboarding_status === "completed";

  const activeAssignment = isOnboarded ? await getActiveAssignment(owned) : null;

  const currentStep = activeAssignment?.current_progress_step
    ? progressSteps.find((step) => step.eventType === activeAssignment.current_progress_step)
    : null;

  const { data: deliverable } = activeAssignment
    ? await supabase
        .from("deliverables")
        .select("*")
        .eq("assignment_id", activeAssignment.id)
        .maybeSingle<Deliverable>()
    : { data: null };

  const awaitingReview = companyEmployee.work_status === "awaiting_review";

  const { data: memoryRows } = await supabase
    .from("employee_memories")
    .select("status")
    .eq("company_employee_id", companyEmployee.id)
    .in("status", ["active", "pending_review"]);

  const learnedCount = (memoryRows ?? []).filter(
    (row) => row.status === "active",
  ).length;
  const pendingCount = (memoryRows ?? []).length - learnedCount;

  const { data: profile } = await supabase
    .from("employee_knowledge_profiles")
    .select("role_knowledge_json")
    .eq("company_employee_id", companyEmployee.id)
    .maybeSingle();

  const roleFacts = buildRoleFacts(
    employee.slug,
    isOnboarded,
    profile?.role_knowledge_json,
  );

  // What they have actually done here, as opposed to what they were told
  // during onboarding. Free — every figure is a count of rows.
  const record = await loadTrackRecord(supabase, companyEmployee.id);

  // What the manager has already handed them and they have not got to yet.
  const { data: queuedRows } = await supabase
    .from("assignments")
    .select("id, title, assigned_at")
    .eq("company_employee_id", companyEmployee.id)
    .eq("status", "waiting")
    .order("assigned_at", { ascending: true });

  const queued = (queuedRows ?? []) as {
    id: string;
    title: string;
    assigned_at: string;
  }[];

  const { data: recurringRows } = await supabase
    .from("recurring_assignments")
    .select("*")
    .eq("company_employee_id", companyEmployee.id)
    .in("status", ["active", "paused"])
    .order("next_run_at", { ascending: true, nullsFirst: false })
    .limit(4);

  const recurring = (recurringRows ?? []) as RecurringAssignmentRow[];

  const { data: initiativeRows } = await supabase
    .from("initiatives")
    .select("id, title, recommendation, confidence")
    .eq("company_employee_id", companyEmployee.id)
    .eq("status", "new")
    .order("confidence_score", { ascending: false })
    .limit(3);

  const initiatives = (initiativeRows ?? []) as {
    id: string;
    title: string;
    recommendation: string;
    confidence: string;
  }[];

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        {completed && isOnboarded && (
          <div className="mb-6 rounded-lg bg-green-50 p-5">
            <p className="font-medium text-green-800">{employee.name} is ready to work.</p>
            <p className="mt-1 text-sm text-green-700">
              {employee.name} has learned about your company and can now receive assignments.
            </p>
          </div>
        )}

        {assigned && activeAssignment && (
          <div className="mb-6 rounded-lg bg-green-50 p-5">
            <p className="font-medium text-green-800">
              Assignment sent to {employee.name}.
            </p>
            <p className="mt-1 text-sm text-green-700">
              {employee.name} is reviewing the work you assigned.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-zinc-200 p-8">
          <h1 className="text-2xl font-semibold text-zinc-900">{employee.name}</h1>
          <p className="mt-1 text-zinc-500">{employee.role}</p>

          <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-zinc-100 pt-6 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <dt className="text-xs text-zinc-500">Status</dt>
              <dd className="mt-1 text-sm font-medium text-zinc-900">
                {isOnboarded
                  ? workStatusLabel[companyEmployee.work_status]
                  : "Needs onboarding"}
              </dd>
            </div>
            {/* Which facts matter differs by role: an analyst is ready once it
                knows the company, an SDR only once it knows who to look for. */}
            {roleFacts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-xs text-zinc-500">{fact.label}</dt>
                <dd className="mt-1 text-sm font-medium text-zinc-900">{fact.value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-xs text-zinc-500">Current Assignment</dt>
              <dd className="mt-1 text-sm font-medium text-zinc-900">
                {activeAssignment ? activeAssignment.title : "None"}
              </dd>
            </div>
          </dl>

          {/*
            Their record here, under what they were told and above what they
            learned. The order is deliberate: a colleague is who they are, then
            what they have done, then what they picked up along the way.

            Nothing is shown until something has happened. Four zeroes read as
            a broken screen; one honest sentence reads as a new colleague.
          */}
          {isOnboarded && (
            <div className="mt-6 border-t border-zinc-100 pt-6">
              <p className="text-xs text-zinc-500">Track record</p>
              {record.finished === 0 && record.awaitingReview === 0 ? (
                <p className="mt-1 text-sm text-zinc-600">
                  {/* One string rather than an expression sitting next to
                      text: JSX drops the space between them when the text
                      wraps onto another line, which renders "Emmahasn't". */}
                  {`${employee.name} hasn't finished anything here yet.`}
                </p>
              ) : (
                <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-zinc-500">Work approved</dt>
                    <dd className="mt-0.5 text-lg font-semibold text-zinc-900">
                      {record.finished}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Sent back at least once</dt>
                    <dd className="mt-0.5 text-lg font-semibold text-zinc-900">
                      {record.sentBack}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Helped a colleague</dt>
                    <dd className="mt-0.5 text-lg font-semibold text-zinc-900">
                      {record.helpedColleagues}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Usually takes</dt>
                    <dd className="mt-0.5 text-lg font-semibold text-zinc-900">
                      {/* Never "0 min". A figure that rounds to zero is not a
                          fast employee, it is a unit too coarse for what was
                          measured, and printing it makes the whole row look
                          made up. */}
                      {record.typicalHours === null
                        ? "—"
                        : record.typicalHours < 1 / 60
                          ? "under a minute"
                          : record.typicalHours < 1
                            ? `${Math.max(1, Math.round(record.typicalHours * 60))} min`
                            : `${record.typicalHours} h`}
                    </dd>
                  </div>
                </dl>
              )}

              {/*
                A rate arrives only once it would survive one more review.
                "100% approved" after two pieces of work is not a fact about
                this employee, it is a fact about the size of the sample, and
                showing it would teach the manager to trust a number that is
                about to move 30 points.
              */}
              {record.approvalRate !== null ? (
                <p className="mt-3 text-sm text-zinc-600">
                  {record.approvalRate}% of {employee.name}&apos;s work was
                  approved without changes.
                </p>
              ) : (
                record.finished > 0 && (
                  <p className="mt-3 text-xs text-zinc-400">
                    Too early for a percentage — that needs {MIN_FOR_RATE}{" "}
                    reviewed pieces of work.
                  </p>
                )
              )}
            </div>
          )}

          {isOnboarded && (
            <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-6">
              <div>
                <p className="text-xs text-zinc-500">Learned On The Job</p>
                <p className="mt-1 text-sm font-medium text-zinc-900">
                  {learnedCount === 0
                    ? "Nothing yet"
                    : `${learnedCount} ${learnedCount === 1 ? "thing" : "things"}`}
                  {pendingCount > 0 && (
                    <span className="ml-2 font-normal text-amber-700">
                      {pendingCount} to confirm
                    </span>
                  )}
                </p>
              </div>
              <Link
                href={`/dashboard/employees/${companyEmployee.id}/memory`}
                className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                View
              </Link>
            </div>
          )}

          {activeAssignment && (
            <div className="mt-6 space-y-4 border-t border-zinc-100 pt-6">
              <div>
                <p className="text-xs text-zinc-500">Current Assignment</p>
                <p className="mt-1 font-medium text-zinc-900">{activeAssignment.title}</p>
              </div>
              <div className="flex gap-8">
                <div>
                  <p className="text-xs text-zinc-500">Priority</p>
                  <p className="mt-1 text-sm capitalize text-zinc-700">
                    {activeAssignment.priority}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Started</p>
                  <p className="mt-1 text-sm text-zinc-700">
                    {activeAssignment.started_at
                      ? formatAssignedDate(activeAssignment.started_at)
                      : "Not yet"}
                  </p>
                </div>
              </div>
              {deliverable && (
                <div>
                  <p className="text-xs text-zinc-500">Deliverable</p>
                  <p className="mt-1 text-sm font-medium text-zinc-900">
                    {deliverable.title}
                  </p>
                  {deliverable.submitted_at && (
                    <p className="mt-0.5 text-xs text-zinc-400">
                      Submitted {formatAssignedDate(deliverable.submitted_at)}
                    </p>
                  )}
                </div>
              )}
              {currentStep && !awaitingReview && (
                <div>
                  <p className="text-xs text-zinc-500">Progress</p>
                  <p className="mt-1 text-sm text-zinc-700">{currentStep.title}</p>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 border-t border-zinc-100 pt-6">
            {!isOnboarded && (
              <div>
                <p className="text-sm text-zinc-600">
                  {employee.name} needs to complete onboarding before receiving work.
                </p>
                {companyEmployee.onboarding_status === "not_started" ? (
                  <form action={startOnboardingAction} className="mt-3">
                    <input
                      type="hidden"
                      name="companyEmployeeId"
                      value={companyEmployee.id}
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
                    >
                      Start Onboarding
                    </button>
                  </form>
                ) : (
                  <Link
                    href={`/dashboard/employees/${companyEmployee.id}/onboarding`}
                    className="mt-3 inline-block rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    Continue Onboarding
                  </Link>
                )}
              </div>
            )}

            {isOnboarded && activeAssignment && (
              <Link
                href={
                  awaitingReview && deliverable
                    ? `/dashboard/deliverables/${deliverable.id}`
                    : `/dashboard/assignments/${activeAssignment.id}`
                }
                className="inline-block rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                {awaitingReview && deliverable ? "Review Deliverable" : "View Assignment"}
              </Link>
            )}

            {isOnboarded && !activeAssignment && (
              <div>
                <p className="text-sm text-zinc-600">
                  {employee.name} is ready for work. Assign {employee.name} a task to begin.
                </p>
                <Link
                  href={`/dashboard/employees/${companyEmployee.id}/assign`}
                  className="mt-3 inline-block rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Assign Work
                </Link>
              </div>
            )}
          </div>
        </div>

        {initiatives.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-medium text-zinc-900">
              {employee.name} recommends
            </h2>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-900">
              {initiatives.map((initiative) => (
                <li
                  key={initiative.id}
                  className="flex items-start justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {initiative.title}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-600">
                      {initiative.recommendation}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/initiatives/${initiative.id}`}
                    className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/*
          Their queue.

          The point of this section is that the manager does not have to hold
          it. Before, a second piece of work was refused outright and the
          manager had to remember it, come back, and type it again — which made
          them the scheduler for a company they hired people to run.
        */}
        {queued.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-medium text-zinc-900">
              {`Up next for ${employee.name}`}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {queued.length === 1
                ? "Starts on its own when the current work is approved."
                : `${queued.length} pieces of work, in the order you gave them. Each starts on its own when the one before it is done.`}
            </p>
            <ol className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {queued.map((item, index) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/assignments/${item.id}`}
                      className="text-sm font-medium text-zinc-900 hover:underline"
                    >
                      {index + 1}. {item.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      Given to them {formatAssignedDate(item.assigned_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {isOnboarded && (
          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-900">Recurring Work</h2>
              <Link
                href={`/dashboard/employees/${companyEmployee.id}/assign/recurring`}
                className="text-xs font-medium text-zinc-700 underline"
              >
                Schedule Recurring Work
              </Link>
            </div>

            {recurring.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">
                {employee.name} has no recurring work scheduled.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                {recurring.slice(0, 3).map((row) => (
                  <li key={row.id} className="px-5 py-4">
                    <Link
                      href={`/dashboard/recurring-assignments/${row.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {row.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {describeSchedule(scheduleOf(row))}
                      {" · "}
                      {recurringStatusLabel[row.status]}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {recurring.length > 3 && (
              <Link
                href={`/dashboard/recurring-assignments?employee=${employee.slug}`}
                className="mt-2 inline-block text-xs text-zinc-600 underline"
              >
                View all
              </Link>
            )}
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-sm font-medium text-zinc-900">Recent Assignments</h2>
          {activeAssignment ? (
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              <li className="px-5 py-4">
                <Link
                  href={`/dashboard/assignments/${activeAssignment.id}`}
                  className="font-medium text-zinc-900 hover:underline"
                >
                  {activeAssignment.title}
                </Link>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Assigned {formatAssignedDate(activeAssignment.assigned_at)}
                </p>
              </li>
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No assignments yet</p>
          )}
        </section>
      </main>
    </div>
  );
}
