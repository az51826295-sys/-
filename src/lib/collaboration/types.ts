import { z } from "zod";

export type InternalRequestStatus =
  | "pending"
  | "working"
  | "completed"
  | "failed"
  | "cancelled"
  | "declined";

export interface InternalRequestRow {
  id: string;
  company_id: string;
  requester_company_employee_id: string;
  assignee_company_employee_id: string;
  parent_assignment_id: string;
  child_assignment_id: string | null;
  title: string;
  description: string;
  requested_capability: string;
  priority: "low" | "normal" | "high";
  status: InternalRequestStatus;
  decline_reason: string | null;
  failure_code: string | null;
  failure_message: string | null;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
}

/**
 * What an employee may ask a colleague for.
 *
 * Deliberately shaped so "I don't need anyone" is the easy answer: the decision
 * is a boolean the model has to set true on purpose, and the brief has to be
 * written out in full. Asking for help should cost a little thought, because
 * every request is another employee's whole afternoon.
 */
export const collaborationDecisionSchema = z.object({
  needsHelp: z.boolean(),
  /** The capability id, from the list the requester was shown. */
  capabilityId: z.string(),
  /** Short title the manager will see on the collaboration row. */
  requestTitle: z.string(),
  /** The brief the colleague works from. They cannot ask a follow-up question,
   *  so this has to stand alone. */
  requestDescription: z.string(),
  /** What the requester intends to do with the result. */
  whyNeeded: z.string(),
});

export type CollaborationDecision = z.infer<typeof collaborationDecisionSchema>;

/** How long a request may sit before it is treated as dead. A run that died
 *  mid-flight must not leave a colleague marked as helping forever. */
export const INTERNAL_REQUEST_TIMEOUT_HOURS = 24;

/** One colleague per assignment. A chain of employees each asking the next is a
 *  way to spend an afternoon and a lot of money on one report. */
export const MAX_INTERNAL_REQUESTS_PER_ASSIGNMENT = 1;

export type InternalRequestFailureCode =
  | "NO_COLLEAGUE_AVAILABLE"
  | "CHILD_ASSIGNMENT_FAILED"
  | "CHILD_CREATE_FAILED"
  | "TIMED_OUT"
  | "INTERNAL_ERROR";

/** What the manager reads if they open the collaboration row. Never a code. */
export const internalRequestFailureCopy: Record<
  InternalRequestFailureCode,
  string
> = {
  NO_COLLEAGUE_AVAILABLE: "No colleague was free to help with this.",
  CHILD_ASSIGNMENT_FAILED: "The colleague couldn't complete this work.",
  CHILD_CREATE_FAILED: "This request couldn't be handed over.",
  TIMED_OUT: "This request went unanswered for too long.",
  INTERNAL_ERROR: "Something went wrong while handing this over.",
};

export const internalRequestStatusLabel: Record<InternalRequestStatus, string> = {
  pending: "Waiting to start",
  working: "Working",
  completed: "Completed",
  failed: "Couldn't finish",
  cancelled: "Cancelled",
  declined: "Not needed",
};

export const internalRequestStatusClass: Record<InternalRequestStatus, string> = {
  pending: "bg-zinc-100 text-zinc-600",
  working: "bg-blue-50 text-blue-700",
  completed: "bg-green-50 text-green-700",
  failed: "bg-amber-50 text-amber-700",
  cancelled: "bg-zinc-100 text-zinc-500",
  declined: "bg-zinc-100 text-zinc-500",
};
