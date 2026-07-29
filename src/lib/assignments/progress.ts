import type { ProgressEventType } from "@/lib/types";

/**
 * The steps a user sees while an employee works. Deliberately coarse — these
 * describe meaningful milestones, never the employee's internal reasoning.
 *
 * The first five are seeded when an assignment is created; the review-phase
 * steps are appended by the submit and review transitions. Titles live here so
 * the workspace can label whatever step an assignment currently sits on.
 */
export const progressSteps: { eventType: ProgressEventType; title: string }[] = [
  { eventType: "assignment_received", title: "Assignment received" },
  { eventType: "company_context_reviewed", title: "Company context reviewed" },
  { eventType: "research_started", title: "Researching relevant information" },
  { eventType: "findings_organized", title: "Organizing findings" },
  { eventType: "deliverable_prepared", title: "Preparing a deliverable" },
  { eventType: "deliverable_submitted", title: "Deliverable submitted" },
  { eventType: "review_approved", title: "Manager approved the deliverable" },
  { eventType: "revision_requested", title: "Manager feedback received" },
  { eventType: "revision_started", title: "Revising the deliverable" },
  { eventType: "assignment_completed", title: "Assignment completed" },
];

/** The five steps seeded when an assignment is first created. */
export const initialProgressSteps = progressSteps.slice(0, 5);
