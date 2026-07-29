"use client";

import { useState } from "react";
import Link from "next/link";
import type { CollaborationView } from "@/lib/collaboration/service";
import {
  internalRequestFailureCopy,
  internalRequestStatusClass,
  internalRequestStatusLabel,
  type InternalRequestFailureCode,
} from "@/lib/collaboration/types";

/**
 * What one employee asked another for, on the manager's view of the work.
 *
 * Collapsed by default. The manager asked for one deliverable and should be
 * able to read it without following an errand between two employees — but if
 * they want to know where a section came from, it has to be there.
 */
export function Collaboration({ requests }: { requests: CollaborationView[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (requests.length === 0) return null;

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 p-6">
      <h2 className="text-sm font-medium text-zinc-900">Collaboration</h2>

      <ul className="mt-3 divide-y divide-zinc-100">
        {requests.map((request) => {
          const open = openId === request.id;

          return (
            <li key={request.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-zinc-900">
                    {request.requesterName} asked {request.assigneeName}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-600">{request.title}</p>
                  {request.failureCode && (
                    <p className="mt-1 text-xs text-amber-700">
                      {internalRequestFailureCopy[
                        request.failureCode as InternalRequestFailureCode
                      ] ?? "This request couldn't be completed."}
                    </p>
                  )}
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${internalRequestStatusClass[request.status]}`}
                >
                  {internalRequestStatusLabel[request.status]}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setOpenId(open ? null : request.id)}
                className="mt-2 text-xs text-zinc-600 underline"
              >
                {open ? "Hide details" : "View internal work"}
              </button>

              {open && (
                <div className="mt-3 rounded-md bg-zinc-50 p-4">
                  <p className="text-xs text-zinc-500">
                    What {request.requesterName} asked for
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-zinc-700">
                    {request.description}
                  </p>

                  {request.childAssignmentId && (
                    <Link
                      href={`/dashboard/assignments/${request.childAssignmentId}`}
                      className="mt-3 inline-block text-xs text-zinc-700 underline"
                    >
                      Open {request.assigneeName}&apos;s work
                    </Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
