"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "idle" | "confirm-approve" | "request-changes";

/**
 * The manager's one decision on a project.
 *
 * Asking for changes records the feedback and flags the project; it does not
 * restart several employees on the spot. That commitment is theirs to make
 * deliberately, not a side effect of typing a note.
 */
export function ProjectReview({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(path: string, body?: unknown) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const parsed = await res.json().catch(() => ({}));
        setError(parsed.error ?? "I couldn't do that.");
        return;
      }
      setMode("idle");
      router.refresh();
    } catch {
      setError("I couldn't do that. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "confirm-approve") {
    return (
      <div className="mt-6 rounded-lg border border-zinc-200 p-6">
        <h2 className="font-medium text-zinc-900">Approve this project?</h2>
        <p className="mt-1 text-sm text-zinc-600">
          This closes the project. Everyone who worked on it is already free.
        </p>

        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setError(null);
            }}
            disabled={submitting}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => send("approve")}
            disabled={submitting}
            className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {submitting ? "Approving..." : "Approve Project"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "request-changes") {
    return (
      <div className="mt-6 rounded-lg border border-zinc-200 p-6">
        <h2 className="font-medium text-zinc-900">Request changes</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Say what should be different. The project is flagged for attention —
          nothing restarts until you decide to run it again.
        </p>

        <textarea
          rows={5}
          value={feedback}
          maxLength={2000}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Prioritise South Korean companies, and explain why the recommended segment is attractive for us."
          className="mt-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        />

        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setError(null);
            }}
            disabled={submitting}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => send("request-changes", { feedback })}
            disabled={submitting}
            className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {submitting ? "Sending..." : "Send Feedback"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 flex justify-end gap-2">
      <button
        type="button"
        onClick={() => setMode("request-changes")}
        className="rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Needs Changes
      </button>
      <button
        type="button"
        onClick={() => setMode("confirm-approve")}
        className="rounded-md border border-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
      >
        Approve
      </button>
    </div>
  );
}
