import type { Assignment, CompanyEmployee, OnboardingStatus } from "@/lib/types";

/**
 * What each employee needs from the manager right now, and in what order they
 * should be shown.
 *
 * The dashboard's job with more than one employee is to answer "who needs me?"
 * before "who works here?" — so the order is by what is waiting on the manager,
 * not by name or hire date.
 */
export type AttentionState =
  | "blocked"
  | "awaiting_review"
  | "working"
  | "reviewing_assignment"
  | "ready"
  | "needs_onboarding";

const ORDER: AttentionState[] = [
  "blocked",
  "awaiting_review",
  "working",
  "reviewing_assignment",
  "ready",
  "needs_onboarding",
];

export function attentionStateFor(
  hire: Pick<CompanyEmployee, "onboarding_status" | "work_status">,
  assignment: Assignment | undefined,
  hasPendingDeliverable: boolean,
): AttentionState {
  if (hire.onboarding_status !== "completed") return "needs_onboarding";
  if (hire.work_status === "blocked") return "blocked";
  if (hasPendingDeliverable || hire.work_status === "awaiting_review") {
    return "awaiting_review";
  }
  if (hire.work_status === "working") return "working";
  if (assignment) return "reviewing_assignment";
  return "ready";
}

export function compareByAttention(a: AttentionState, b: AttentionState): number {
  return ORDER.indexOf(a) - ORDER.indexOf(b);
}

/** Two of these are the same word to the manager — "working" — but they mean
 *  different things to the system, so they stay distinct here and merge in the
 *  label. */
export const attentionLabel: Record<AttentionState, string> = {
  blocked: "Needs attention",
  awaiting_review: "Waiting for your review",
  working: "Working",
  reviewing_assignment: "Reviewing assignment",
  ready: "Ready for work",
  needs_onboarding: "Needs onboarding",
};

export const attentionBadgeClass: Record<AttentionState, string> = {
  blocked: "bg-red-50 text-red-700",
  awaiting_review: "bg-amber-50 text-amber-700",
  working: "bg-blue-50 text-blue-700",
  reviewing_assignment: "bg-blue-50 text-blue-700",
  ready: "bg-green-50 text-green-700",
  needs_onboarding: "bg-amber-50 text-amber-700",
};

export const onboardingCta: Record<Exclude<OnboardingStatus, "completed">, string> = {
  not_started: "Start Onboarding",
  in_progress: "Continue Onboarding",
};

/** Human name for a deliverable type, so the dashboard can say what is waiting
 *  without knowing which employee produced it. */
export const deliverableTypeLabel: Record<string, string> = {
  market_research_report: "Market Research Report",
  lead_list: "Lead List",
  art_bible: "Art Bible",
};

export function labelForDeliverableType(type: string): string {
  return deliverableTypeLabel[type] ?? "Deliverable";
}
