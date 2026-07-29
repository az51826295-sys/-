"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Tries a failed turn again on the same occurrence, so the history shows one
 *  Monday retried rather than two Mondays. */
export function RetryOccurrenceButton({ occurrenceId }: { occurrenceId: string }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/recurring-assignment-occurrences/${occurrenceId}/retry`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "I couldn't try that again.");
        return;
      }
      router.refresh();
    } catch {
      setError("I couldn't try that again. Please try again.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="mt-2 text-right">
      <button
        type="button"
        onClick={retry}
        disabled={retrying}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
      >
        {retrying ? "Trying..." : "Try Again"}
      </button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
