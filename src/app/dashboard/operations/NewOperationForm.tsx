"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Starting a period of operation.
 *
 * The manager states a direction, not a task. Everything below it — which
 * projects, in what order, by which department — follows from this and comes
 * back for approval before anything runs.
 */
export function NewOperationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!name.trim()) {
      setError("Give this period a name.");
      return;
    }
    if (objective.trim().length < 20) {
      setError("Describe the objective in at least 20 characters.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, objective }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(`${body.error ?? "I couldn't start this."} Your input has been preserved.`);
        return;
      }

      router.push(`/dashboard/operations/${body.cycleId}`);
    } catch {
      setError("I couldn't start this. Your input has been preserved. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8 space-y-6 rounded-lg border border-zinc-200 p-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-zinc-900">
          What should we call this period?
        </label>
        <input
          id="name"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="Q3 Growth"
          className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="objective" className="block text-sm font-medium text-zinc-900">
          What is your company trying to achieve?
        </label>
        <textarea
          id="objective"
          rows={4}
          value={objective}
          maxLength={2000}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Find our first repeatable customer segment and build a pipeline we can sell into."
          className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        />
        <p className="mt-1 text-xs text-zinc-400">
          A direction, not a task. The work that gets there is worked out for you
          and comes back for your approval.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center justify-end gap-4">
        {submitting && (
          <p className="text-xs text-zinc-500">Working out how this breaks down.</p>
        )}
        <button
          type="button"
          onClick={start}
          disabled={submitting}
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {submitting ? "Starting..." : "Start Operation"}
        </button>
      </div>
    </div>
  );
}
