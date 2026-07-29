"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "confirm" | "reject" | "archive";

/**
 * The manager's say over one lesson. Every button is a decision about whether
 * the employee keeps using it, so each says what it does rather than "approve".
 */
export function MemoryActions({
  memoryId,
  status,
  employeeName,
}: {
  memoryId: string;
  status: "active" | "pending_review" | "archived";
  employeeName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: Action) {
    setPending(action);
    setError(null);
    try {
      const res = await fetch(`/api/memories/${memoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "I couldn't save that.");
        return;
      }
      router.refresh();
    } catch {
      setError("I couldn't save that. Please try again.");
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {status === "pending_review" && (
          <>
            <button
              type="button"
              onClick={() => decide("confirm")}
              disabled={busy}
              className="rounded-md border border-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            >
              {pending === "confirm" ? "Saving..." : "Yes, remember this"}
            </button>
            <button
              type="button"
              onClick={() => decide("reject")}
              disabled={busy}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
            >
              {pending === "reject" ? "Saving..." : "No, that's wrong"}
            </button>
          </>
        )}

        {status === "active" && (
          <button
            type="button"
            onClick={() => decide("archive")}
            disabled={busy}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
          >
            {pending === "archive" ? "Saving..." : `Stop using this`}
          </button>
        )}

        {status === "archived" && (
          <button
            type="button"
            onClick={() => decide("confirm")}
            disabled={busy}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            {pending === "confirm" ? "Saving..." : `Let ${employeeName} use this again`}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
