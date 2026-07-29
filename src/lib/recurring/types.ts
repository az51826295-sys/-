import type { Weekday } from "@/lib/schedule/time";

export type RecurringStatus = "active" | "paused" | "ended";
export type ConflictPolicy = "wait" | "skip";

export type OccurrenceStatus =
  | "scheduled"
  | "processing"
  | "waiting"
  | "assignment_created"
  | "skipped"
  | "failed"
  | "cancelled";

export interface RecurringAssignmentRow {
  id: string;
  company_id: string;
  company_employee_id: string;
  title: string;
  description: string;
  expected_outcome: string | null;
  priority: "low" | "normal" | "high";
  role_input_json: unknown;
  role_input_schema_id: string | null;
  frequency: "daily" | "weekly" | "monthly";
  interval_count: number;
  days_of_week: Weekday[];
  day_of_month: number | null;
  local_time: string;
  timezone: string;
  start_date: string;
  status: RecurringStatus;
  conflict_policy: ConflictPolicy;
  next_run_at: string | null;
  last_run_at: string | null;
  paused_at: string | null;
  ended_at: string | null;
  pause_reason: string | null;
  consecutive_failure_count: number;
  last_failure_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OccurrenceRow {
  id: string;
  company_id: string;
  recurring_assignment_id: string;
  company_employee_id: string;
  scheduled_for: string;
  status: OccurrenceStatus;
  assignment_id: string | null;
  skip_reason: string | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  failed_at: string | null;
}

/** Pause after this many turns in a row that couldn't produce an assignment.
 *  A schedule failing repeatedly is broken, and quietly retrying for ever is
 *  worse than stopping and saying so. */
export const MAX_CONSECUTIVE_SCHEDULE_FAILURES = 3;

/** How long a waiting turn stays worth doing. Last Monday's competitor review
 *  run on Friday is still useful; three weeks late it is a different job. */
export const WAITING_OCCURRENCE_MAX_AGE_DAYS = 7;

/** Keeps one company from filling the scheduler with work nobody reads. */
export const MAX_RECURRING_ASSIGNMENTS_PER_COMPANY = 20;

/** How many due schedules one scheduler pass will take on. */
export const SCHEDULER_BATCH_LIMIT = 100;

export type ScheduleFailureCode =
  | "EMPLOYEE_UNAVAILABLE"
  | "EMPLOYEE_NOT_ONBOARDED"
  | "EMPLOYEE_SKILL_NOT_FOUND"
  | "INVALID_ROLE_INPUT"
  | "ASSIGNMENT_CREATE_FAILED"
  | "INTERNAL_ERROR";

/** What the manager reads. Never a code, never a stack trace. */
export const scheduleFailureCopy: Record<ScheduleFailureCode, string> = {
  EMPLOYEE_UNAVAILABLE: "This employee is no longer available for scheduled work.",
  EMPLOYEE_NOT_ONBOARDED: "This employee needs to finish onboarding first.",
  EMPLOYEE_SKILL_NOT_FOUND: "This employee is not ready for recurring work.",
  INVALID_ROLE_INPUT: "The saved work settings are no longer valid.",
  ASSIGNMENT_CREATE_FAILED: "The scheduled assignment could not be created.",
  INTERNAL_ERROR: "The scheduled assignment could not be created.",
};

export const occurrenceStatusLabel: Record<OccurrenceStatus, string> = {
  scheduled: "Scheduled",
  processing: "Starting",
  waiting: "Waiting",
  assignment_created: "Assignment created",
  skipped: "Skipped",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const recurringStatusLabel: Record<RecurringStatus, string> = {
  active: "Active",
  paused: "Paused",
  ended: "Ended",
};

export const recurringStatusClass: Record<RecurringStatus, string> = {
  active: "bg-green-50 text-green-700",
  paused: "bg-amber-50 text-amber-700",
  ended: "bg-zinc-100 text-zinc-600",
};

/** Employee states that mean a scheduled turn cannot start right now. Work
 *  waiting on the manager's review counts as busy — the employee is not free
 *  until the deliverable is dealt with. */
export const BUSY_WORK_STATUSES = ["assigned", "working", "awaiting_review", "blocked"];
