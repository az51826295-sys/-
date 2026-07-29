"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionType } from "@/lib/intelligence/types";

/** Where accepting a suggestion actually sends the manager. Advice that ends at
 *  "consider hiring an analyst" leaves them to turn it into an action
 *  themselves, which is the part they wanted help with. */
const DESTINATION: Record<ActionType, (payload: Record<string, unknown>) => string | null> = {
  open_hiring: () => "/employees",
  review_playbook: () => "/dashboard/playbooks",
  review_queue: () => "/dashboard/assignments",
  review_learning: () => "/dashboard/learning",
  review_deliverables: () => "/dashboard/deliverables",
  open_department: (payload) =>
    payload.departmentId ? `/dashboard/departments/${payload.departmentId}` : "/dashboard/organization",
  none: () => null,
};

export function RecommendationActions({
  recommendationId,
  action,
}: {
  recommendationId: string;
  action: { type: ActionType; payload: Record<string, unknown> } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "dismissed") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/recommendations/${recommendationId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "I couldn't record that.");
        return;
      }

      const destination =
        decision === "approved" && action
          ? DESTINATION[action.type](action.payload)
          : null;

      if (destination) router.push(destination);
      else router.refresh();
    } catch {
      setError("I couldn't record that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

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
          onClick={() => decide("approved")}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          Take me there
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("dismissed")}
          className="text-sm text-zinc-500 underline disabled:opacity-60"
        >
          Not a problem
        </button>
      </div>
    </div>
  );
}
