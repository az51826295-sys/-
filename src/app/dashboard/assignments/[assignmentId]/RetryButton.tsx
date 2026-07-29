"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Retries whichever kind of work failed. A failed revision resumes the same
 * revision request — the target version must not drift because an attempt
 * failed — while a failed initial run starts a fresh execution.
 */
export function RetryButton({
  executionId,
  employeeName,
  revisionRequestId,
}: {
  executionId: string;
  employeeName: string;
  revisionRequestId?: string | null;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRevision = Boolean(revisionRequestId);

  async function retry() {
    setSubmitting(true);
    setError(null);
    try {
      const endpoint = isRevision
        ? `/api/revision-requests/${revisionRequestId}/retry`
        : `/api/work-executions/${executionId}/retry`;

      const res = await fetch(endpoint, { method: "POST" });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setError(body?.error ?? `${employeeName} could not start this work again.`);
        return;
      }
      router.refresh();
    } catch {
      setError(`${employeeName} could not start this work again.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={retry}
        disabled={submitting}
        className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {submitting
          ? "Starting again..."
          : isRevision
            ? "Retry Revision"
            : "Retry Assignment"}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
