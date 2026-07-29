"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FEEDBACK_MAX, FEEDBACK_MIN } from "@/lib/deliverables/validation";

type Mode = "idle" | "confirm-approve" | "request-changes";

export function ReviewActions({
  deliverableId,
  employeeName,
}: {
  deliverableId: string;
  employeeName: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  // Kept in state across a failed submit so the manager never retypes feedback.
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/deliverables/${deliverableId}/approve`, {
        method: "POST",
      });
      const body = await res.json();

      if (!res.ok) {
        if (body.latestDeliverableId) {
          router.push(`/dashboard/deliverables/${body.latestDeliverableId}`);
          return;
        }
        setError(body.error ?? "I couldn't approve this deliverable.");
        return;
      }

      // Learning runs after the approval has already landed and is not awaited:
      // it takes a while, and the manager should not be kept waiting to find out
      // their approval worked. The panel below reports how it went.
      void fetch(`/api/deliverables/${deliverableId}/learn`, { method: "POST" });

      router.refresh();
    } catch {
      setError("I couldn't approve this deliverable. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function sendFeedback() {
    if (feedback.trim().length < FEEDBACK_MIN) {
      setError(`Add at least ${FEEDBACK_MIN} characters of feedback.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // Sending feedback also starts the revision, which takes a few minutes.
      const res = await fetch(`/api/deliverables/${deliverableId}/request-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(
          `${body.error ?? "I couldn't send your feedback."} Your feedback has been preserved.`,
        );
        return;
      }
      router.refresh();
    } catch {
      setError(
        "I couldn't send your feedback. Your feedback has been preserved. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "confirm-approve") {
    return (
      <div className="mt-6 rounded-lg border border-zinc-200 p-6">
        <h2 className="font-medium text-zinc-900">Approve this deliverable?</h2>
        <p className="mt-1 text-sm text-zinc-600">
          This will mark the assignment as completed and make {employeeName} available for
          new work.
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
            onClick={approve}
            disabled={submitting}
            className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {submitting ? "Approving..." : "Approve Deliverable"}
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
          Tell {employeeName} what should be improved before submitting the work again.
        </p>

        <label
          htmlFor="feedback"
          className="mt-6 block text-sm font-medium text-zinc-900"
        >
          Feedback for {employeeName}
        </label>
        <textarea
          id="feedback"
          rows={5}
          value={feedback}
          maxLength={FEEDBACK_MAX}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Add a clearer pricing comparison and include direct evidence for the key findings."
          className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
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
            onClick={sendFeedback}
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
