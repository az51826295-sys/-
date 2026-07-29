"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { learningErrorCopy, type LearningErrorCode } from "@/lib/memory/types";

interface Session {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  candidateCount: number;
  acceptedCount: number;
  rejectedCount: number;
  errorCode: LearningErrorCode | null;
}

/**
 * What the employee took away from this piece of work. Learning runs after
 * approval and separately from it, so this panel never claims the work itself
 * is unfinished — at worst it says the lesson wasn't saved.
 */
export function LearningPanel({
  deliverableId,
  companyEmployeeId,
  employeeName,
}: {
  deliverableId: string;
  companyEmployeeId: string;
  employeeName: string;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [retrying, setRetrying] = useState(false);
  // A deliverable approved before this employee could learn has no session and
  // never will unless asked, so waiting is given up on rather than shown for
  // ever.
  const [givenUpWaiting, setGivenUpWaiting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/deliverables/${deliverableId}/learn`);
      if (!res.ok) return null;
      const body = await res.json();
      setSession(body.session);
      return body.session as Session | null;
    } catch {
      return null;
    }
  }, [deliverableId]);

  useEffect(() => {
    let cancelled = false;
    let emptyChecks = 0;

    async function poll() {
      const current = await load();
      if (cancelled) return;

      if (!current) {
        emptyChecks += 1;
        // Roughly twelve seconds, enough for a session opened by an approval a
        // moment ago to appear.
        if (emptyChecks >= 3) {
          setGivenUpWaiting(true);
          return;
        }
        setTimeout(poll, 4000);
        return;
      }

      // Stops on its own once there is nothing left to wait for.
      if (current.status === "pending" || current.status === "running") {
        setTimeout(poll, 4000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function start() {
    setRetrying(true);
    try {
      await fetch(`/api/deliverables/${deliverableId}/learn`, { method: "POST" });
      await load();
    } finally {
      setRetrying(false);
    }
  }

  async function retry() {
    if (!session) return;
    setRetrying(true);
    try {
      await fetch(`/api/learning-sessions/${session.id}/retry`, { method: "POST" });
      await load();
    } finally {
      setRetrying(false);
    }
  }

  if (!session && givenUpWaiting) {
    return (
      <section className="mt-6 rounded-lg border border-zinc-200 px-5 py-4">
        <p className="text-sm text-zinc-600">
          {`${employeeName} hasn't taken anything from this work yet.`}
        </p>
        <button
          type="button"
          onClick={start}
          disabled={retrying}
          className="mt-3 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
        >
          {retrying ? "Working..." : `Save what ${employeeName} learned`}
        </button>
      </section>
    );
  }

  if (!session || session.status === "pending" || session.status === "running") {
    return (
      <section className="mt-6 rounded-lg border border-zinc-200 px-5 py-4">
        <p className="text-sm text-zinc-600">
          {employeeName} is noting what to take from this work...
        </p>
      </section>
    );
  }

  if (session.status === "failed") {
    return (
      <section className="mt-6 rounded-lg bg-amber-50 px-5 py-4">
        <p className="text-sm text-amber-900">
          {employeeName}{" "}
          {learningErrorCopy[session.errorCode ?? "LEARNING_EXTRACTION_FAILED"]}
        </p>
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          className="mt-3 rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
        >
          {retrying ? "Trying again..." : "Try Again"}
        </button>
      </section>
    );
  }

  if (session.acceptedCount === 0) {
    return (
      <section className="mt-6 rounded-lg border border-zinc-200 px-5 py-4">
        <p className="text-sm text-zinc-600">
          {`${employeeName} didn't find anything new worth remembering from this work.`}
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-lg bg-green-50 px-5 py-4">
      <p className="text-sm font-medium text-green-900">
        {employeeName} learned {session.acceptedCount}{" "}
        {session.acceptedCount === 1 ? "thing" : "things"} from this work
      </p>
      <Link
        href={`/dashboard/employees/${companyEmployeeId}/memory`}
        className="mt-2 inline-block text-xs font-medium text-green-800 underline"
      >
        See what {employeeName} has learned
      </Link>
    </section>
  );
}
