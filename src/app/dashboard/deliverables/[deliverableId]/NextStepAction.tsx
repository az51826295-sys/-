"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Turning one recommended next step into work.
 *
 * This screen used to end with a row of "Give to Alex" / "Give to Emma"
 * buttons. They worked, but they put the manager back in the job the product
 * is supposed to take off them: reading a sentence, working out which
 * discipline it belongs to, and remembering who here does that. On a company
 * with two employees it is a small ask. It is also the exact ask that stops
 * being possible at eight.
 *
 * So the first button no longer names anybody. It sends the step through the
 * same path as the home screen — the work gets divided up, somebody is
 * proposed for each piece with a reason, and the manager reads the plan before
 * anything starts. Picking a person by hand is still there, one line down, for
 * when the manager knows something the plan does not.
 */
export function NextStepAction({ step }: { step: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setSubmitting(true);
    setError(null);

    try {
      const created = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: step.slice(0, 200),
          // The step is both the name and the whole brief. It was written by
          // somebody who had just finished the work it follows on from, so it
          // already carries the context a hand-typed version would lose.
          goal: step,
          priority: "normal",
        }),
      });

      const body = await created.json();

      if (!created.ok) {
        setError(body.error ?? "I couldn't start this.");
        return;
      }

      const planned = await fetch(`/api/projects/${body.projectId}/prepare-plan`, {
        method: "POST",
      });

      router.push(
        planned.ok
          ? `/dashboard/projects/${body.projectId}/plan`
          : `/dashboard/projects/${body.projectId}`,
      );
    } catch {
      setError("I couldn't start this. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={submitting}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {submitting ? "Working out who..." : "Start this"}
      </button>
      {error && (
        <span className="text-sm text-red-700">{error}</span>
      )}
    </>
  );
}
