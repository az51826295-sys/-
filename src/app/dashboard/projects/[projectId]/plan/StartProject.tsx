"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * The manager's decision point.
 *
 * Starting is what commits real money and several people's time, so it is a
 * deliberate click on a plan they have read — not something that happened while
 * they were typing the goal.
 */
export function StartProject({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"start" | "replan" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(path: string, then: string) {
    setPending(path === "start" ? "start" : "replan");
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/${path}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "I couldn't do that.");
        return;
      }
      router.push(then);
      router.refresh();
    } catch {
      setError("I couldn't do that. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-8">
      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        <Link href="/dashboard/projects" className="text-sm text-zinc-600 underline">
          Back
        </Link>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => run("prepare-plan", `/dashboard/projects/${projectId}/plan`)}
            disabled={pending !== null}
            className="rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            {pending === "replan" ? "Preparing..." : "Prepare a Different Plan"}
          </button>
          <button
            type="button"
            onClick={() => run("start", `/dashboard/projects/${projectId}`)}
            disabled={pending !== null}
            className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {pending === "start" ? "Starting..." : "Start Project"}
          </button>
        </div>
      </div>

      {pending === "start" && (
        <p className="mt-3 text-right text-xs text-zinc-500">
          Your workforce is getting started. This takes a few minutes.
        </p>
      )}
    </div>
  );
}
