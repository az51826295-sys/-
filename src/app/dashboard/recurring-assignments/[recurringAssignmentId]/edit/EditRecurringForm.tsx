"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { RecurringDraft } from "@/lib/recurring/draft";
import { scheduleFromDraft } from "@/lib/recurring/draft";
import { describeSchedule, getNextOccurrence } from "@/lib/schedule/recurrence";
import { formatInZone } from "@/lib/schedule/time";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  OUTCOME_MAX,
  TITLE_MAX,
  TITLE_MIN,
} from "@/lib/assignments/validation";
import type { AssignmentPriority } from "@/lib/types";
import { AssignmentFormExtension } from "@/app/dashboard/employees/[companyEmployeeId]/assign/extensions";
import { ScheduleFields } from "@/app/dashboard/employees/[companyEmployeeId]/assign/recurring/ScheduleFields";

const priorities: AssignmentPriority[] = ["low", "normal", "high"];

/**
 * Editing works on the live record rather than the sessionStorage draft — the
 * manager is changing something that exists, and the values on screen should be
 * what is actually stored.
 */
export function EditRecurringForm({
  recurringAssignmentId,
  employeeName,
  skillId,
  roleDefaults,
  timezone,
  initial,
  hasWaiting,
}: {
  recurringAssignmentId: string;
  employeeName: string;
  skillId: string;
  roleDefaults: unknown;
  timezone: string;
  initial: RecurringDraft;
  hasWaiting: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<RecurringDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<RecurringDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  const schedule = { ...scheduleFromDraft(draft), timezone };
  const nextRun = getNextOccurrence(schedule, new Date());

  async function handleSave() {
    const title = draft.title.trim();
    const description = draft.description.trim();

    if (title.length < TITLE_MIN) {
      setError(`Give the recurring assignment a title of at least ${TITLE_MIN} characters.`);
      return;
    }
    if (description.length < DESCRIPTION_MIN) {
      setError(`Add at least ${DESCRIPTION_MIN} characters of context.`);
      return;
    }
    if (draft.frequency === "weekly" && draft.daysOfWeek.length === 0) {
      setError("Choose at least one day for this weekly assignment.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/recurring-assignments/${recurringAssignmentId}`, {
        method: "PUT",
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
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "I couldn't save these changes.");
        return;
      }

      router.push(`/dashboard/recurring-assignments/${recurringAssignmentId}`);
    } catch {
      setError("I couldn't save these changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8">
      {/* Said before saving, not after: a waiting turn belongs to the old
          schedule and cannot be carried into the new one. */}
      {hasWaiting && (
        <div className="rounded-lg bg-amber-50 px-5 py-4">
          <p className="text-sm text-amber-900">
            A scheduled assignment is currently waiting for {employeeName}. Saving
            these changes will cancel it, because it belongs to the old schedule.
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-zinc-900">
            What should {employeeName} do each time?
          </label>
          <input
            id="title"
            type="text"
            value={draft.title}
            maxLength={TITLE_MAX}
            onChange={(e) => update({ title: e.target.value })}
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-zinc-900">
            Add more context
          </label>
          <textarea
            id="description"
            rows={5}
            value={draft.description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => update({ description: e.target.value })}
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="expectedOutcome"
            className="block text-sm font-medium text-zinc-900"
          >
            What would a good result look like?
          </label>
          <textarea
            id="expectedOutcome"
            rows={3}
            value={draft.expectedOutcome}
            maxLength={OUTCOME_MAX}
            onChange={(e) => update({ expectedOutcome: e.target.value })}
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div>
          <span className="block text-sm font-medium text-zinc-900">Priority</span>
          <div className="mt-2 flex gap-2">
            {priorities.map((priority) => (
              <button
                key={priority}
                type="button"
                onClick={() => update({ priority })}
                className={`rounded-md border px-4 py-2 text-sm capitalize ${
                  draft.priority === priority
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {priority}
              </button>
            ))}
          </div>
        </div>
      </div>

      <AssignmentFormExtension
        skillId={skillId}
        employeeName={employeeName}
        defaults={roleDefaults}
        value={draft.roleInput}
        onChange={(roleInput) => update({ roleInput })}
      />

      <ScheduleFields
        draft={draft}
        timezone={timezone}
        employeeName={employeeName}
        onChange={update}
      />

      <div className="mt-6 rounded-lg border border-zinc-200 px-5 py-4">
        <p className="text-xs text-zinc-500">After saving</p>
        <p className="mt-1 text-sm font-medium text-zinc-900">
          {describeSchedule(schedule)}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {nextRun
            ? `Next assignment ${formatInZone(nextRun, timezone)}`
            : "This schedule never comes around. Check the days and time."}
        </p>
      </div>

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mt-8 flex items-center justify-between">
        <Link
          href={`/dashboard/recurring-assignments/${recurringAssignmentId}`}
          className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !nextRun}
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
