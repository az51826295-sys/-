"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AssignmentExample } from "@/lib/employees/definitions";
import type { RecurringDraft } from "@/lib/recurring/draft";
import { useRecurringDraft } from "@/lib/recurring/useDraft";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  OUTCOME_MAX,
  TITLE_MAX,
  TITLE_MIN,
} from "@/lib/assignments/validation";
import type { AssignmentPriority } from "@/lib/types";
import { AssignmentFormExtension } from "../extensions";
import { ScheduleFields } from "./ScheduleFields";

const priorities: AssignmentPriority[] = ["low", "normal", "high"];

export function RecurringForm({
  companyEmployeeId,
  employeeName,
  examples,
  skillId,
  roleDefaults,
  timezone,
}: {
  companyEmployeeId: string;
  employeeName: string;
  examples: AssignmentExample[];
  skillId: string;
  roleDefaults: unknown;
  timezone: string;
}) {
  const router = useRouter();
  const { draft, setDraft } = useRecurringDraft(companyEmployeeId, timezone);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<RecurringDraft>) {
    setDraft({ ...draft, ...patch });
  }

  function applyExample(example: AssignmentExample) {
    update({
      title: example.title,
      description: example.description ?? draft.description,
      expectedOutcome: example.expectedOutcome ?? draft.expectedOutcome,
    });
    setError(null);
  }

  function handleContinue() {
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
    if (!draft.localTime) {
      setError("Choose a valid time.");
      return;
    }

    router.push(
      `/dashboard/employees/${companyEmployeeId}/assign/recurring/review`,
    );
  }

  return (
    <div className="mt-8">
      {examples.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-5">
          <p className="text-sm font-medium text-zinc-900">Need an example?</p>
          <div className="mt-3 flex flex-col gap-2">
            {examples.map((example) => (
              <button
                key={example.title}
                type="button"
                onClick={() => applyExample(example)}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-700 hover:border-zinc-400"
              >
                {example.title}
              </button>
            ))}
          </div>
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
            placeholder="Weekly competitor update"
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
            placeholder="Review our main competitors and report only meaningful changes since the previous update."
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-400">
            {employeeName} sees this every time, so write it as a standing
            instruction rather than a one-off request.
          </p>
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
          <p className="mt-1 text-xs text-zinc-400">Optional.</p>
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

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={handleContinue}
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
