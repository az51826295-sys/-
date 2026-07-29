import type { AssignmentStatus, DeliverableStatus, WorkStatus } from "@/lib/types";

/** Internal state names never reach the screen — these do. */
export const workStatusLabel: Record<WorkStatus, string> = {
  ready: "Ready for work",
  assigned: "Reviewing assignment",
  working: "Working",
  awaiting_review: "Waiting for your review",
  blocked: "Needs attention",
};

export const assignmentStatusLabel: Record<AssignmentStatus, string> = {
  draft: "Draft",
  // Said from the manager's side, not the system's. "Queued" describes a data
  // structure; "Waiting their turn" describes a colleague with something else
  // on their desk, which is what has actually happened.
  waiting: "Waiting their turn",
  assigned: "Reviewing assignment",
  queued: "Starting work",
  working: "Working",
  submitted: "Submitted",
  needs_changes: "Revising deliverable",
  revision_queued: "Revising deliverable",
  revising: "Revising deliverable",
  completed: "Completed",
  failed: "Needs attention",
  cancelled: "Cancelled",
};

export const deliverableStatusLabel: Record<DeliverableStatus, string> = {
  draft: "Draft",
  submitted: "Pending Review",
  approved: "Approved",
  needs_changes: "Needs Changes",
  superseded: "Superseded",
};

export const deliverableStatusClass: Record<DeliverableStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700",
  submitted: "bg-amber-50 text-amber-700",
  approved: "bg-green-50 text-green-700",
  needs_changes: "bg-blue-50 text-blue-700",
  superseded: "bg-zinc-100 text-zinc-500",
};

export function formatAssignedDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const isSameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (isSameDay) return "Today";

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
