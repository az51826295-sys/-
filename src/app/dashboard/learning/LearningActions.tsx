"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error ?? "I couldn't record that.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("I couldn't record that. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, send };
}

/**
 * Deciding whether one piece of work should change how the company works.
 *
 * Three answers rather than two. "Send it back" exists because the common case
 * is not a wrong idea but a badly worded one, and forcing a manager to choose
 * between adopting a vague standard and throwing away a real insight would make
 * them do one or the other for the wrong reason.
 */
export function CandidateActions({ candidateId }: { candidateId: string }) {
  const { busy, error, send } = useAction();
  const [noteFor, setNoteFor] = useState<"rejected" | "needs_revision" | null>(null);
  const [note, setNote] = useState("");

  return (
    <div className="mt-4">
      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {noteFor ? (
        <div className="space-y-3">
          <textarea
            rows={2}
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              noteFor === "rejected"
                ? "Why doesn't this hold for the company?"
                : "What would make this worth adopting?"
            }
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setNoteFor(null);
                setNote("");
              }}
              className="text-sm text-zinc-600 underline"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const ok = await send(
                  `/api/learning/candidates/${candidateId}/decide`,
                  "POST",
                  { decision: noteFor, note },
                );
                if (ok) {
                  setNoteFor(null);
                  setNote("");
                }
              }}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {noteFor === "rejected" ? "Turn down" : "Send back"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              send(`/api/learning/candidates/${candidateId}/approve`, "POST")
            }
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            Adopt for the company
          </button>
          <button
            type="button"
            onClick={() => setNoteFor("needs_revision")}
            className="text-sm text-zinc-600 underline"
          >
            Send back
          </button>
          <button
            type="button"
            onClick={() => setNoteFor("rejected")}
            className="text-sm text-zinc-500 underline"
          >
            Turn down
          </button>
        </div>
      )}
    </div>
  );
}

export function DraftActions({
  draftId,
  playbookId,
}: {
  draftId: string;
  playbookId: string;
}) {
  const { busy, error, send } = useAction();
  const router = useRouter();

  return (
    <div className="mt-4">
      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            const ok = await send(`/api/playbooks/drafts/${draftId}`, "POST");
            // Straight to the playbook: applying leaves an unpublished change,
            // and sending the manager somewhere else would let them believe the
            // method had already changed.
            if (ok) router.push(`/dashboard/playbooks/${playbookId}`);
          }}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          Add to the method
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => send(`/api/playbooks/drafts/${draftId}`, "DELETE")}
          className="text-sm text-zinc-500 underline disabled:opacity-60"
        >
          Not worth it
        </button>
      </div>
    </div>
  );
}
