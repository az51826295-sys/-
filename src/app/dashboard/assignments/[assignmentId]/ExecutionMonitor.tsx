"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 5000;

interface ExecutionStatus {
  status: string;
  displayStatus: string | null;
  searchesCompleted: number;
  sourcesReviewed: number;
}

/**
 * Kicks off the run (when arriving with ?start=1) and polls its status.
 * Execution state lives on the server, so closing this page doesn't lose the
 * run — reopening it picks the status back up.
 */
export function ExecutionMonitor({
  assignmentId,
  executionId,
  shouldStart,
  employeeName,
}: {
  assignmentId: string;
  executionId: string | null;
  shouldStart: boolean;
  employeeName: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ExecutionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const currentIdRef = useRef<string | null>(executionId);

  const poll = useCallback(async () => {
    const id = currentIdRef.current;
    if (!id) return;

    try {
      const res = await fetch(`/api/work-executions/${id}`);
      if (!res.ok) return;

      const body = (await res.json()) as ExecutionStatus;
      setStatus(body);

      if (body.status === "completed" || body.status === "failed") {
        currentIdRef.current = null;
        router.refresh();
      }
    } catch {
      // A dropped poll is not a failed run — the next tick retries.
    }
  }, [router]);

  useEffect(() => {
    if (!shouldStart || startedRef.current) return;
    startedRef.current = true;

    // Not awaited: the request runs for minutes, and progress arrives via polling.
    fetch(`/api/assignments/${assignmentId}/execute`, { method: "POST" })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok && body?.executionId) {
          currentIdRef.current = body.executionId;
        }
        router.refresh();
      })
      .catch(() => {
        setError(`${employeeName} could not be reached to start this work.`);
      });
  }, [assignmentId, employeeName, router, shouldStart]);

  useEffect(() => {
    currentIdRef.current = executionId;
  }, [executionId]);

  useEffect(() => {
    if (!executionId) return;

    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [executionId, poll]);

  if (error) {
    return (
      <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
    );
  }

  if (!status || (status.status !== "running" && status.status !== "queued")) {
    return null;
  }

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 px-5 py-4">
      <p className="text-sm font-medium text-zinc-900">
        {status.displayStatus ?? "Working"}
      </p>
      {(status.searchesCompleted > 0 || status.sourcesReviewed > 0) && (
        <p className="mt-1 text-xs text-zinc-500">
          {status.searchesCompleted} searches completed &middot;{" "}
          {status.sourcesReviewed} sources reviewed
        </p>
      )}
    </div>
  );
}
