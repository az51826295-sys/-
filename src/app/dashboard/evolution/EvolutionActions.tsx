"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function useDecide() {
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
        return;
      }
      router.refresh();
    } catch {
      setError("I couldn't record that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, send };
}

/**
 * Accepting the shape of the company changing.
 *
 * Accepting records the decision and nothing more. No department is created and
 * nobody is hired — reorganising a company on the strength of its own
 * suggestion is the one thing a manager most needs to do themselves.
 */
export function EvolutionActions({ planId }: { planId: string }) {
  const { busy, error, send } = useDecide();

  return (
    <div className="mt-8">
      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            send(`/api/evolution/${planId}/decide`, "POST", { decision: "approved" })
          }
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          This is the direction
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            send(`/api/evolution/${planId}/decide`, "POST", { decision: "cancelled" })
          }
          className="text-sm text-zinc-500 underline disabled:opacity-60"
        >
          Not now
        </button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Accepting records your decision. It doesn&apos;t create a department or
        hire anybody — those stay yours to do.
      </p>
    </div>
  );
}

export function GapActions({ gapId }: { gapId: string }) {
  const { busy, send } = useDecide();

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => send(`/api/role-gaps/${gapId}`, "DELETE")}
      className="mt-3 text-xs text-zinc-500 underline disabled:opacity-60"
    >
      Not a gap — we don&apos;t need this
    </button>
  );
}
