"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearRecurringDraft, scheduleFromDraft } from "@/lib/recurring/draft";
import { useRecurringDraft } from "@/lib/recurring/useDraft";
import { describeSchedule, getNextOccurrence } from "@/lib/schedule/recurrence";
import { formatInZone } from "@/lib/schedule/time";

export function RecurringReview({
  companyEmployeeId,
  employeeName,
  employeeRole,
  timezone,
}: {
  companyEmployeeId: string;
  employeeName: string;
  employeeRole: string;
  timezone: string;
}) {
  const router = useRouter();
  const { stored: draft, hydrated } = useRecurringDraft(companyEmployeeId, timezone);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!draft) {
    return hydrated ? (
      <div className="mt-8 rounded-lg border border-zinc-200 p-8">
        <p className="text-sm text-zinc-600">
          There&apos;s no recurring assignment to review yet.
        </p>
        <Link
          href={`/dashboard/employees/${companyEmployeeId}/assign/recurring`}
          className="mt-4 inline-block rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Describe the work
        </Link>
      </div>
    ) : null;
  }

  const schedule = { ...scheduleFromDraft(draft), timezone };
  const summary = describeSchedule(schedule);
  // Shown before activating, because "when does this actually start" is the one
  // thing a manager cannot work out from the form alone.
  const firstRun = getNextOccurrence(schedule, new Date());

  async function handleActivate() {
    if (!draft) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/company-employees/${companyEmployeeId}/recurring-assignments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: draft.title,
            description: draft.description,
            expectedOutcome: draft.expectedOutcome,
            priority: draft.priority,
            roleInput: draft.roleInput,
            conflictPolicy: draft.conflictPolicy,
            schedule,
          }),
        },
      );

      const body = await res.json();

      if (!res.ok) {
        setError(`${body.error ?? "I couldn't set this up."} Your input has been preserved.`);
        return;
      }

      clearRecurringDraft(companyEmployeeId);
      router.push(`/dashboard/recurring-assignments/${body.recurringAssignmentId}?created=1`);
    } catch {
      setError("I couldn't set this up. Your input has been preserved. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8">
      <div className="space-y-6 rounded-lg border border-zinc-200 p-8">
        <div>
          <h2 className="text-xs text-zinc-500">Employee</h2>
          <p className="mt-1 font-medium text-zinc-900">{employeeName}</p>
          <p className="text-sm text-zinc-500">{employeeRole}</p>
        </div>

        <div className="border-t border-zinc-100 pt-6">
          <h2 className="text-xs text-zinc-500">Assignment</h2>
          <p className="mt-1 font-medium text-zinc-900">{draft.title}</p>
        </div>

        <div>
          <h2 className="text-xs text-zinc-500">Context</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-zinc-700">
            {draft.description}
          </p>
        </div>

        {draft.expectedOutcome.trim() && (
          <div>
            <h2 className="text-xs text-zinc-500">Expected Result</h2>
            <p className="mt-1 whitespace-pre-line text-sm text-zinc-700">
              {draft.expectedOutcome}
            </p>
          </div>
        )}

        <div className="border-t border-zinc-100 pt-6">
          <h2 className="text-xs text-zinc-500">Repeats</h2>
          <p className="mt-1 font-medium text-zinc-900">{summary}</p>
        </div>

        <div>
          <h2 className="text-xs text-zinc-500">Time Zone</h2>
          <p className="mt-1 text-sm text-zinc-700">{timezone}</p>
        </div>

        <div>
          <h2 className="text-xs text-zinc-500">First Assignment</h2>
          <p className="mt-1 text-sm text-zinc-700">
            {firstRun
              ? formatInZone(firstRun, timezone)
              : "This schedule never comes around. Go back and check the days."}
          </p>
        </div>

        <div>
          <h2 className="text-xs text-zinc-500">If {employeeName} is busy</h2>
          <p className="mt-1 text-sm text-zinc-700">
            {draft.conflictPolicy === "wait"
              ? "Wait until available"
              : "Skip that time"}
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-md bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <Link
          href={`/dashboard/employees/${companyEmployeeId}/assign/recurring`}
          className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Back
        </Link>
        <button
          type="button"
          onClick={handleActivate}
          disabled={submitting || !firstRun}
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {submitting ? "Activating..." : "Activate Recurring Assignment"}
        </button>
      </div>
    </div>
  );
}
