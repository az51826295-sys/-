"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { RecurringStatus } from "@/lib/recurring/types";

type Action = "pause" | "resume" | "end";

export function RecurringActions({
  recurringAssignmentId,
  status,
  employeeName,
}: {
  recurringAssignmentId: string;
  status: RecurringStatus;
  employeeName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action) {
    setPending(action);
    setError(null);
    try {
      const res = await fetch(
        `/api/recurring-assignments/${recurringAssignmentId}/${action}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "I couldn't do that.");
        return;
      }
      setConfirmingEnd(false);
      router.refresh();
    } catch {
      setError("I couldn't do that. Please try again.");
    } finally {
      setPending(null);
    }
  }

  if (status === "ended") {
    return (
      <div className="mt-6 flex justify-end">
        {/* Ended is final. Starting again means a new schedule, so the only
            action offered is one that creates one. */}
        <Link
          href={`/dashboard/recurring-assignments/new`}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Set Up a New One
        </Link>
      </div>
    );
  }

  if (confirmingEnd) {
    return (
      <div className="mt-6 rounded-lg border border-zinc-200 p-6">
        <h2 className="font-medium text-zinc-900">End this recurring assignment?</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Future assignments will no longer be created. Existing assignments and
          deliverables are kept, and {employeeName} keeps everything learned from
          them.
        </p>

        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setConfirmingEnd(false);
              setError(null);
            }}
            disabled={pending !== null}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => run("end")}
            disabled={pending !== null}
            className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {pending === "end" ? "Ending..." : "End Recurring Assignment"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap justify-end gap-2">
        {status === "active" ? (
          <button
            type="button"
            onClick={() => run("pause")}
            disabled={pending !== null}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            {pending === "pause" ? "Pausing..." : "Pause"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => run("resume")}
            disabled={pending !== null}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            {pending === "resume" ? "Resuming..." : "Resume"}
          </button>
        )}

        <Link
          href={`/dashboard/recurring-assignments/${recurringAssignmentId}/edit`}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Edit Schedule
        </Link>

        <button
          type="button"
          onClick={() => setConfirmingEnd(true)}
          disabled={pending !== null}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
        >
          End
        </button>
      </div>

      {error && <p className="mt-3 text-right text-sm text-red-700">{error}</p>}
    </div>
  );
}
