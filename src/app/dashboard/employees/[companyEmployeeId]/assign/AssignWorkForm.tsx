"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  clarityBandClass,
  clarityBandLabel,
  scoreClarity,
} from "@/lib/assignments/clarity";
import { useRouter } from "next/navigation";
import type { AssignmentExample } from "@/lib/employees/definitions";
import type { AssignmentDraft } from "@/lib/assignments/draft";
import { useAssignmentDraft } from "@/lib/assignments/useDraft";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  OUTCOME_MAX,
  TITLE_MAX,
  TITLE_MIN,
  validateAssignmentInput,
} from "@/lib/assignments/validation";
import type { AssignmentPriority } from "@/lib/types";
import { AssignmentFormExtension } from "./extensions";

const priorities: AssignmentPriority[] = ["low", "normal", "high"];

export function AssignWorkForm({
  companyEmployeeId,
  employeeName,
  examples,
  skillId,
  roleDefaults,
  suggestedTitle,
}: {
  companyEmployeeId: string;
  employeeName: string;
  examples: AssignmentExample[];
  skillId: string;
  /** Carried in from a report's next steps. Fills the title only when the
   *  manager has not already started writing — a half-typed assignment is
   *  theirs, and replacing it would be the product overwriting a person. */
  suggestedTitle?: string;
  /** What this employee learned during onboarding, used to fill the role
   *  fields' placeholders. Never written back. */
  roleDefaults: unknown;
}) {
  const router = useRouter();
  // Kept in sessionStorage, so every keystroke survives the review hop and any
  // failed submit without a round trip to the database.
  const { draft, setDraft } = useAssignmentDraft(companyEmployeeId);
  const [error, setError] = useState<string | null>(null);

  // Once, on arrival. A ref rather than a dependency on the draft, so typing
  // and then clearing the field does not make the suggestion reappear.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (suggestedTitle && !draft.title.trim()) {
      setDraft({ ...draft, title: suggestedTitle.slice(0, 120) });
    }
  }, [suggestedTitle, draft, setDraft]);

  // Recomputed on every keystroke, which costs nothing — it is string
  // arithmetic, not a request.
  const clarity = useMemo(
    () =>
      scoreClarity({
        title: draft.title,
        description: draft.description,
        expectedOutcome: draft.expectedOutcome,
      }),
    [draft.title, draft.description, draft.expectedOutcome],
  );

  function update(patch: Partial<AssignmentDraft>) {
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
    const validationError = validateAssignmentInput(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    router.push(`/dashboard/employees/${companyEmployeeId}/assign/review`);
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
            What do you need {employeeName} to do?
          </label>
          <input
            id="title"
            type="text"
            value={draft.title}
            maxLength={TITLE_MAX}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Research our three main competitors"
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-400">
            One sentence, {TITLE_MIN}&ndash;{TITLE_MAX} characters.
          </p>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-zinc-900">
            Add more context
          </label>
          <textarea
            id="description"
            rows={6}
            value={draft.description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Focus on pricing, product features, target customers, and positioning."
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-400">
            Explain the outcome you expect, important context, and anything{" "}
            {employeeName} should pay attention to. At least {DESCRIPTION_MIN} characters.
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
            placeholder="A clear comparison of each competitor with the most important differences."
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-400">Optional.</p>
        </div>

        {/*
          Shown after the three fields, not before them.
          A score at the top would read as a test to pass before writing; here
          it reads as a second opinion on what has been written, which is what
          it is. It never blocks submitting — a vague assignment can be exactly
          the right question, and the manager knows things this does not.
        */}
        <div className="rounded-lg border border-zinc-200 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-zinc-900">
              How much {employeeName} will have to guess
            </p>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${clarityBandClass[clarity.band]}`}
            >
              {clarityBandLabel[clarity.band]} · {clarity.score}/100
            </span>
          </div>

          {clarity.missing.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">
              Nothing obvious is missing. {employeeName} knows what you want and
              when they&apos;re done.
            </p>
          ) : (
            <ul className="mt-3 space-y-1">
              {clarity.missing.map((item) => (
                <li key={item.id} className="text-sm text-zinc-600">
                  · {item.hint}
                </li>
              ))}
            </ul>
          )}
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
