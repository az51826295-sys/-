"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AssignmentSnapshot } from "@/lib/initiatives/types";

/**
 * The manager's decision.
 *
 * Approving shows the brief first: they are agreeing to a specific piece of
 * work, and the employee starts on it immediately, so it should not be a
 * surprise afterwards.
 */
export function InitiativeActions({
  initiativeId,
  employeeName,
  snapshot,
}: {
  initiativeId: string;
  employeeName: string;
  snapshot: AssignmentSnapshot;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<"approve" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "approve" | "dismiss") {
    setPending(action);
    setError(null);
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "I couldn't do that.");
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (action === "approve" && body.assignmentId) {
        router.push(`/dashboard/assignments/${body.assignmentId}`);
        return;
      }
      router.refresh();
    } catch {
      setError("I couldn't do that. Please try again.");
    } finally {
      setPending(null);
    }
  }

  if (confirming) {
    return (
      <div className="mt-6 rounded-lg border border-zinc-200 p-6">
        <h2 className="font-medium text-zinc-900">
          Start this work now?
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          {employeeName} will begin as soon as you approve.
        </p>

        <div className="mt-4 rounded-md bg-zinc-50 p-4">
          <p className="text-xs text-zinc-500">Assignment</p>
          <p className="mt-0.5 text-sm font-medium text-zinc-900">{snapshot.title}</p>
          <p className="mt-2 whitespace-pre-line text-sm text-zinc-700">
            {snapshot.description}
          </p>
          {snapshot.expectedOutcome && (
            <>
              <p className="mt-3 text-xs text-zinc-500">Expected result</p>
              <p className="mt-0.5 text-sm text-zinc-700">
                {snapshot.expectedOutcome}
              </p>
            </>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
            disabled={pending !== null}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => run("approve")}
            disabled={pending !== null}
            className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {pending === "approve" ? "Starting..." : `Approve and start`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {/* Some recommendations are one person's job and some are the team's. The
          manager decides which, because they know what they want back. */}
      <p className="text-right text-xs text-zinc-500">
        Approving gives this to {employeeName} alone. If it needs more than one
        person,{" "}
        <Link href="/dashboard/projects" className="underline">
          start it as a project
        </Link>{" "}
        instead.
      </p>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => run("dismiss")}
          disabled={pending !== null}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
        >
          {pending === "dismiss" ? "Dismissing..." : "Dismiss"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending !== null}
          className="rounded-md border border-zinc-900 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
        >
          Approve
        </button>
      </div>

      {error && <p className="mt-3 text-right text-sm text-red-700">{error}</p>}

      {/* Said plainly, because a dismissal is a decision the employee remembers
          and the manager should know that. */}
      <p className="mt-3 text-right text-xs text-zinc-500">
        Dismissing stops {employeeName} raising this again.
      </p>
    </div>
  );
}
