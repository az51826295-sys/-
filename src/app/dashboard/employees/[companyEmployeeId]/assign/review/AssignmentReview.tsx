"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearDraft } from "@/lib/assignments/draft";
import { useAssignmentDraft } from "@/lib/assignments/useDraft";

const ROLE_INPUT_LABELS: Record<string, string> = {
  targetCount: "Companies wanted",
  industries: "Industries",
  locations: "Locations",
  requiredSignals: "Required signals",
  excludedCompanies: "Also exclude",
  buyerRoles: "Buyer roles",
};

function summarizeRoleInput(roleInput: unknown): { label: string; value: string }[] {
  if (!roleInput || typeof roleInput !== "object") return [];
  const value = roleInput as Record<string, unknown>;
  const rows: { label: string; value: string }[] = [];

  for (const [key, label] of Object.entries(ROLE_INPUT_LABELS)) {
    const entry = value[key];
    if (Array.isArray(entry) && entry.length > 0) {
      rows.push({ label, value: entry.join(", ") });
    } else if (typeof entry === "number") {
      rows.push({ label, value: String(entry) });
    }
  }

  const range = value.employeeRange as { min?: number; max?: number } | undefined;
  if (range && (range.min !== undefined || range.max !== undefined)) {
    rows.push({
      label: "Company size",
      value:
        range.min !== undefined && range.max !== undefined
          ? `${range.min}–${range.max} employees`
          : range.min !== undefined
            ? `${range.min} employees or more`
            : `Up to ${range.max} employees`,
    });
  }

  return rows;
}

export function AssignmentReview({
  companyEmployeeId,
  employeeName,
  employeeRole,
}: {
  companyEmployeeId: string;
  employeeName: string;
  employeeRole: string;
}) {
  const router = useRouter();
  const { stored: draft, hydrated } = useAssignmentDraft(companyEmployeeId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held across retries so a failed start never creates a second assignment.
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function handleAssign() {
    if (!draft) return;

    setSubmitting(true);
    setError(null);

    try {
      let assignmentId = createdId;

      if (!assignmentId) {
        const res = await fetch(
          `/api/company-employees/${companyEmployeeId}/assignments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draft),
          },
        );
        const body = await res.json();

        if (!res.ok) {
          if (body.assignmentId) {
            router.push(`/dashboard/assignments/${body.assignmentId}`);
            return;
          }
          setError(
            `${body.error ?? `I couldn't assign this work to ${employeeName}.`} Your input has been preserved.`,
          );
          return;
        }

        assignmentId = body.assignmentId as string;
        setCreatedId(assignmentId);

        // Queued behind something already running. It starts on its own when
        // that finishes, so the page must not ask it to start now — "?start=1"
        // on queued work would try to run two things at once and fail in front
        // of somebody who did nothing wrong.
        if (body.queued) {
          clearDraft(companyEmployeeId);
          router.push(`/dashboard/assignments/${assignmentId}`);
          return;
        }
      }

      // Work itself starts on the assignment page, which can show progress
      // while it runs — a research run takes minutes, so blocking the submit
      // button on it would leave the user staring at a spinner.
      clearDraft(companyEmployeeId);
      router.push(`/dashboard/assignments/${assignmentId}?start=1`);
    } catch {
      setError(
        `I couldn't assign this work to ${employeeName}. Your input has been preserved. Please try again.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Only what the manager actually set. An empty filter means "use what I
  // taught you", and showing it as a blank row would read like a mistake.
  const roleSummary = summarizeRoleInput(draft?.roleInput);

  if (!draft) {
    // Nothing to review — most likely a direct hit on this URL.
    return hydrated ? (
      <div className="mt-8 rounded-lg border border-zinc-200 p-8">
        <p className="text-sm text-zinc-600">
          There&apos;s no assignment to review yet.
        </p>
        <Link
          href={`/dashboard/employees/${companyEmployeeId}/assign`}
          className="mt-4 inline-block rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Describe the work
        </Link>
      </div>
    ) : null;
  }

  return (
    <div className="mt-8">
      <div className="space-y-6 rounded-lg border border-zinc-200 p-8">
        <div>
          <h2 className="text-xs text-zinc-500">Assigned to</h2>
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

        <div>
          <h2 className="text-xs text-zinc-500">Priority</h2>
          <p className="mt-1 text-sm capitalize text-zinc-700">{draft.priority}</p>
        </div>

        {roleSummary.length > 0 && (
          <div className="border-t border-zinc-100 pt-6">
            <h2 className="text-xs text-zinc-500">What {employeeName} will look for</h2>
            <dl className="mt-2 space-y-1">
              {roleSummary.map((entry) => (
                <div key={entry.label} className="flex gap-2 text-sm">
                  <dt className="text-zinc-500">{entry.label}:</dt>
                  <dd className="text-zinc-700">{entry.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-6 rounded-md bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={handleAssign}
            disabled={submitting}
            className="mt-2 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-60"
          >
            Try Again
          </button>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <Link
          href={`/dashboard/employees/${companyEmployeeId}/assign`}
          className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Edit Assignment
        </Link>
        <button
          type="button"
          onClick={handleAssign}
          disabled={submitting}
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {submitting ? "Assigning..." : `Assign to ${employeeName}`}
        </button>
      </div>
    </div>
  );
}
