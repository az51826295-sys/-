"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The manager says what they want, not who should do it.
 *
 * Two steps, not one: this creates the project and asks for a plan, and the
 * plan comes back for them to read before anybody starts. Collapsing that would
 * mean discovering the work was divided wrongly only after paying for it.
 */
export function NewProjectForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [outcome, setOutcome] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!title.trim()) {
      setError("Give the project a title.");
      return;
    }
    if (goal.trim().length < 20) {
      setError("Describe the goal in at least 20 characters.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const created = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, goal, expectedOutcome: outcome, priority }),
      });

      const body = await created.json();

      if (!created.ok) {
        setError(`${body.error ?? "I couldn't start this."} Your input has been preserved.`);
        return;
      }

      const planned = await fetch(`/api/projects/${body.projectId}/prepare-plan`, {
        method: "POST",
      });

      if (!planned.ok) {
        // The project exists either way, so send them to it — the failure and
        // its retry live there rather than being lost with this form.
        router.push(`/dashboard/projects/${body.projectId}`);
        return;
      }

      router.push(`/dashboard/projects/${body.projectId}/plan`);
    } catch {
      setError("I couldn't start this. Your input has been preserved. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8 space-y-6 rounded-lg border border-zinc-200 p-6">
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-zinc-900">
          Project Title
        </label>
        <input
          id="title"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Customer Support AI Market Opportunity"
          className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="goal" className="block text-sm font-medium text-zinc-900">
          What should your workforce accomplish?
        </label>
        <textarea
          id="goal"
          rows={4}
          value={goal}
          maxLength={5000}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Analyze the customer support AI market and identify companies we should target."
          className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        />
        <p className="mt-1 text-xs text-zinc-400">
          Describe the outcome, not the steps. The work gets divided up for you.
        </p>
      </div>

      <div>
        <label htmlFor="outcome" className="block text-sm font-medium text-zinc-900">
          What would a successful result look like?
        </label>
        <textarea
          id="outcome"
          rows={3}
          value={outcome}
          maxLength={3000}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="A market overview, recommended customer segments, and a verified prospect list."
          className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="priority" className="block text-sm font-medium text-zinc-900">
          Priority
        </label>
        <select
          id="priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as "low" | "normal" | "high")}
          className="mt-2 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center justify-end gap-4">
        {submitting && (
          <p className="text-xs text-zinc-500">
            Working out who should do what. This takes a moment.
          </p>
        )}
        <button
          type="button"
          onClick={start}
          disabled={submitting}
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {submitting ? "Preparing..." : "Prepare Project Plan"}
        </button>
      </div>
    </div>
  );
}
