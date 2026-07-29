import { notFound } from "next/navigation";
import Link from "next/link";
import { getOwnedRecurring, listOccurrences } from "@/lib/recurring/access";
import { scheduleOf } from "@/lib/recurring/service";
import { describeSchedule } from "@/lib/schedule/recurrence";
import { formatInZone } from "@/lib/schedule/time";
import { NavBar } from "@/components/NavBar";
import {
  occurrenceStatusLabel,
  recurringStatusClass,
  recurringStatusLabel,
  scheduleFailureCopy,
  type ScheduleFailureCode,
} from "@/lib/recurring/types";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { RecurringActions } from "./RecurringActions";
import { RetryOccurrenceButton } from "./RetryOccurrenceButton";

export default async function RecurringAssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ recurringAssignmentId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { recurringAssignmentId } = await params;
  const { created } = await searchParams;

  const owned = await getOwnedRecurring(recurringAssignmentId);
  if (!owned) notFound();

  const { recurring, employee, companyEmployeeId } = owned;
  const occurrences = await listOccurrences(recurringAssignmentId, 30);

  const summary = describeSchedule(scheduleOf(recurring));
  const deliverableLabel =
    getEmployeeDefinition(employee.slug)?.deliverable.label ?? "deliverable";
  const nextRun = recurring.next_run_at
    ? formatInZone(new Date(recurring.next_run_at), recurring.timezone)
    : null;

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        {created && (
          <div className="mb-6 rounded-lg bg-green-50 p-5">
            <p className="font-medium text-green-800">
              Recurring assignment activated.
            </p>
            <p className="mt-1 text-sm text-green-700">
              {nextRun
                ? `${employee.name}'s first assignment is scheduled for ${nextRun}.`
                : `${employee.name} will start at the next scheduled time.`}
            </p>
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{recurring.title}</h1>
            <p className="mt-2 text-sm text-zinc-700">{employee.name}</p>
            <p className="text-sm text-zinc-500">{employee.role}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${recurringStatusClass[recurring.status]}`}
          >
            {recurringStatusLabel[recurring.status]}
          </span>
        </div>

        {recurring.pause_reason && (
          <div className="mt-6 rounded-lg bg-amber-50 px-5 py-4">
            <p className="text-sm font-medium text-amber-900">
              Recurring work needs attention
            </p>
            <p className="mt-1 text-sm text-amber-800">{recurring.pause_reason}</p>
          </div>
        )}

        <dl className="mt-6 grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 p-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-zinc-500">Repeats</dt>
            <dd className="mt-1 text-sm font-medium text-zinc-900">{summary}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Time Zone</dt>
            <dd className="mt-1 text-sm font-medium text-zinc-900">
              {recurring.timezone}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">If busy</dt>
            <dd className="mt-1 text-sm font-medium text-zinc-900">
              {recurring.conflict_policy === "wait" ? "Wait" : "Skip"}
            </dd>
          </div>
        </dl>

        <section className="mt-6 rounded-lg border border-zinc-200 p-6">
          <h2 className="text-sm font-medium text-zinc-900">Upcoming</h2>
          {recurring.status === "active" && nextRun ? (
            <>
              <p className="mt-2 text-sm text-zinc-900">{nextRun}</p>
              <p className="mt-1 text-sm text-zinc-600">
                {employee.name} will start &ldquo;{recurring.title}&rdquo; and
                hand in a {deliverableLabel}.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-600">
              {recurring.status === "paused"
                ? "No assignment is scheduled while this recurring assignment is paused."
                : "This recurring assignment has ended."}
            </p>
          )}
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-medium text-zinc-900">What to do each time</h2>
          <div className="mt-3 rounded-lg border border-zinc-200 p-6">
            <p className="whitespace-pre-line text-sm text-zinc-700">
              {recurring.description}
            </p>
            {recurring.expected_outcome && (
              <div className="mt-4 border-t border-zinc-100 pt-4">
                <p className="text-xs text-zinc-500">Expected result</p>
                <p className="mt-1 whitespace-pre-line text-sm text-zinc-700">
                  {recurring.expected_outcome}
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-medium text-zinc-900">Assignment History</h2>
          {occurrences.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">
              No assignments have been created from this schedule yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {occurrences.map((occurrence) => (
                <li
                  key={occurrence.id}
                  className="flex items-start justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {formatInZone(
                        new Date(occurrence.scheduled_for),
                        recurring.timezone,
                        { hour: undefined, minute: undefined },
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {occurrenceStatusLabel[occurrence.status]}
                    </p>
                    {/* Why a turn produced nothing is the part the manager
                        actually needs; a bare "skipped" reads like a bug. */}
                    {occurrence.skip_reason && (
                      <p className="mt-1 text-xs text-zinc-600">
                        {occurrence.skip_reason}
                      </p>
                    )}
                    {occurrence.failure_code && (
                      <p className="mt-1 text-xs text-amber-700">
                        {scheduleFailureCopy[
                          occurrence.failure_code as ScheduleFailureCode
                        ] ?? "The scheduled assignment could not be created."}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    {occurrence.assignment_id && (
                      <Link
                        href={`/dashboard/assignments/${occurrence.assignment_id}`}
                        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        View Assignment
                      </Link>
                    )}
                    {occurrence.status === "failed" && (
                      <RetryOccurrenceButton occurrenceId={occurrence.id} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <RecurringActions
          recurringAssignmentId={recurring.id}
          status={recurring.status}
          employeeName={employee.name}
        />

        <div className="mt-6 flex justify-between">
          <Link
            href="/dashboard/recurring-assignments"
            className="text-sm text-zinc-600 underline"
          >
            All recurring assignments
          </Link>
          <Link
            href={`/dashboard/employees/${companyEmployeeId}`}
            className="text-sm text-zinc-600 underline"
          >
            Back to {employee.name}
          </Link>
        </div>
      </main>
    </div>
  );
}
