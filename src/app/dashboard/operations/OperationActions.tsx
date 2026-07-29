"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Recommendation } from "@/lib/operations/types";

/**
 * Where a recommendation becomes a decision.
 *
 * Approving creates a project in draft and takes the manager to its plan. It
 * does not start work — that is a second, separate approval, because starting
 * a project costs the company real money and several people's time.
 */
export function OperationActions({
  cycleId,
  recommendations,
}: {
  cycleId: string;
  recommendations: Recommendation[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(path: string, key: string, body?: unknown) {
    setPending(key);
    setError(null);
    try {
      const res = await fetch(`/api/operations/${cycleId}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const parsed = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(parsed.error ?? "I couldn't do that.");
        return;
      }

      if (parsed.projectId) {
        router.push(`/dashboard/projects/${parsed.projectId}/plan`);
        return;
      }

      router.refresh();
    } catch {
      setError("I couldn't do that. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {recommendations.map((recommendation, index) => (
        <div
          key={`${recommendation.title}-${index}`}
          className="rounded-lg border border-zinc-200 px-5 py-4"
        >
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm font-medium text-zinc-900">
              {recommendation.title}
            </p>
            {recommendation.priority === "high" && (
              <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                High priority
              </span>
            )}
          </div>

          <p className="mt-2 text-sm text-zinc-600">{recommendation.reasoning}</p>

          {recommendation.needsManagerAction ? (
            // Nothing to hand over — saying so is more useful than a button
            // that would create an empty project.
            <p className="mt-3 text-xs text-zinc-500">
              This one is yours to do — there&apos;s no work to hand to the team.
            </p>
          ) : (
            <button
              type="button"
              onClick={() =>
                send("approve-next-step", `approve-${index}`, {
                  recommendationIndex: index,
                })
              }
              disabled={pending !== null}
              className="mt-3 rounded-md border border-zinc-900 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            >
              {pending === `approve-${index}` ? "Setting up..." : "Take this on"}
            </button>
          )}
        </div>
      ))}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => send("dismiss-review", "dismiss")}
          disabled={pending !== null}
          className="text-sm text-zinc-600 underline disabled:opacity-60"
        >
          {pending === "dismiss" ? "Dismissing..." : "Not now"}
        </button>
      </div>
    </div>
  );
}

/** Runs a review, and closes the period. Kept apart from the recommendation
 *  buttons because these are about the operation itself rather than about any
 *  one piece of advice. */
export function OperationControls({
  cycleId,
  canReview,
  canComplete,
}: {
  cycleId: string;
  canReview: boolean;
  canComplete: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingComplete, setConfirmingComplete] = useState(false);

  async function send(path: string) {
    setPending(path);
    setError(null);
    try {
      const res = await fetch(`/api/operations/${cycleId}/${path}`, {
        method: "POST",
      });
      if (!res.ok) {
        const parsed = await res.json().catch(() => ({}));
        setError(parsed.error ?? "I couldn't do that.");
        return;
      }
      setConfirmingComplete(false);
      router.refresh();
    } catch {
      setError("I couldn't do that. Please try again.");
    } finally {
      setPending(null);
    }
  }

  if (confirmingComplete) {
    return (
      <div className="mt-8 rounded-lg border border-zinc-200 p-6">
        <h2 className="font-medium text-zinc-900">Close this operation?</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Work already finished is kept. Projects still running carry on — they
          just stop belonging to a current period.
        </p>

        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmingComplete(false)}
            disabled={pending !== null}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => send("complete")}
            disabled={pending !== null}
            className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {pending === "complete" ? "Closing..." : "Close Operation"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {canComplete && (
          <button
            type="button"
            onClick={() => setConfirmingComplete(true)}
            disabled={pending !== null}
            className="rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            Close Operation
          </button>
        )}
        {canReview && (
          <button
            type="button"
            onClick={() => send("review")}
            disabled={pending !== null}
            className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {pending === "review" ? "Reviewing..." : "Review Where We Are"}
          </button>
        )}
      </div>
    </div>
  );
}
