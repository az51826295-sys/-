import { createClient } from "@/lib/supabase/server";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { validateAssignmentRoleInput } from "@/lib/roles/schemas";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  OUTCOME_MAX,
  TITLE_MAX,
  TITLE_MIN,
} from "@/lib/assignments/validation";
import { getNextOccurrence, validateSchedule } from "@/lib/schedule/recurrence";
import {
  MAX_RECURRING_ASSIGNMENTS_PER_COMPANY,
  type ConflictPolicy,
  type RecurringAssignmentRow,
} from "@/lib/recurring/types";
import type { Result } from "@/lib/assignments/service";

export interface RecurringInput {
  title: string;
  description: string;
  expectedOutcome?: string;
  priority: "low" | "normal" | "high";
  roleInput?: unknown;
  schedule: unknown;
  conflictPolicy?: string;
}

function validateText(input: RecurringInput): string | null {
  const title = input.title?.trim() ?? "";
  const description = input.description?.trim() ?? "";
  const outcome = input.expectedOutcome?.trim() ?? "";

  if (title.length < TITLE_MIN) {
    return `Give the recurring assignment a title of at least ${TITLE_MIN} characters.`;
  }
  if (title.length > TITLE_MAX) return `Keep the title under ${TITLE_MAX} characters.`;
  if (description.length < DESCRIPTION_MIN) {
    return `Add at least ${DESCRIPTION_MIN} characters of context.`;
  }
  if (description.length > DESCRIPTION_MAX) {
    return `Keep the context under ${DESCRIPTION_MAX} characters.`;
  }
  if (outcome.length > OUTCOME_MAX) {
    return `Keep the expected result under ${OUTCOME_MAX} characters.`;
  }
  if (!["low", "normal", "high"].includes(input.priority)) {
    return "Choose a valid priority.";
  }
  return null;
}

/**
 * Sets up a standing instruction. Nothing runs now — the first assignment is
 * created when its scheduled time actually arrives, so activating at 8:59 for a
 * 9:00 schedule doesn't produce two runs.
 */
export async function createRecurringAssignment(
  companyEmployeeId: string,
  input: RecurringInput,
): Promise<Result<{ recurringAssignmentId: string; nextRunAt: string }>> {
  const owned = await getOwnedCompanyEmployee(companyEmployeeId);
  if (!owned) return { error: "Employee not found.", status: 404 };

  const { supabase, companyEmployee, employee } = owned;

  if (companyEmployee.onboarding_status !== "completed") {
    return {
      error: `${employee.name} must complete onboarding before recurring work can be scheduled.`,
      status: 409,
    };
  }

  const definition = getEmployeeDefinition(employee.slug);
  if (!definition) {
    return { error: "This employee is not ready for recurring work.", status: 409 };
  }

  const textError = validateText(input);
  if (textError) return { error: textError, status: 400 };

  const schedule = validateSchedule(input.schedule);
  if (!schedule.ok) return { error: schedule.error, status: 400 };

  const roleInput = validateAssignmentRoleInput(
    definition.assignmentInputSchemaId,
    input.roleInput,
  );
  if (!roleInput.ok) return { error: roleInput.error, status: 400 };

  const conflictPolicy: ConflictPolicy =
    input.conflictPolicy === "skip" ? "skip" : "wait";

  // Ended schedules are history, so they don't count against the limit.
  const { count } = await supabase
    .from("recurring_assignments")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyEmployee.company_id)
    .in("status", ["active", "paused"]);

  if ((count ?? 0) >= MAX_RECURRING_ASSIGNMENTS_PER_COMPANY) {
    return {
      error: "Your company has reached the recurring assignment limit.",
      status: 409,
    };
  }

  const nextRunAt = getNextOccurrence(schedule.schedule, new Date());
  if (!nextRunAt) {
    return { error: "This schedule never comes around. Check the days and time.", status: 400 };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: created, error } = await supabase
    .from("recurring_assignments")
    .insert({
      company_id: companyEmployee.company_id,
      company_employee_id: companyEmployee.id,
      title: input.title.trim(),
      description: input.description.trim(),
      expected_outcome: input.expectedOutcome?.trim() || null,
      priority: input.priority,
      role_input_json: roleInput.value,
      role_input_schema_id: definition.assignmentInputSchemaId,
      frequency: schedule.schedule.frequency,
      interval_count: schedule.schedule.interval,
      days_of_week: schedule.schedule.daysOfWeek ?? [],
      day_of_month: schedule.schedule.dayOfMonth ?? null,
      local_time: schedule.schedule.localTime,
      timezone: schedule.schedule.timezone,
      start_date: schedule.schedule.startDate,
      status: "active",
      conflict_policy: conflictPolicy,
      next_run_at: nextRunAt.toISOString(),
      created_by_user_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { error: "I couldn't set up this recurring assignment.", status: 500 };
  }

  return {
    recurringAssignmentId: created.id as string,
    nextRunAt: nextRunAt.toISOString(),
  };
}

export async function updateRecurringAssignment(
  recurringAssignmentId: string,
  input: RecurringInput,
): Promise<Result<{ nextRunAt: string | null }>> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("recurring_assignments")
    .select("*, company_employees!inner(id, employees(slug, name))")
    .eq("id", recurringAssignmentId)
    .maybeSingle();

  if (!existing) return { error: "Recurring assignment not found.", status: 404 };

  const row = existing as RecurringAssignmentRow & {
    company_employees: { id: string; employees: { slug: string; name: string } };
  };

  if (row.status === "ended") {
    return { error: "This recurring assignment has ended.", status: 409 };
  }

  const definition = getEmployeeDefinition(row.company_employees.employees.slug);
  if (!definition) {
    return { error: "This employee is not ready for recurring work.", status: 409 };
  }

  const textError = validateText(input);
  if (textError) return { error: textError, status: 400 };

  const schedule = validateSchedule(input.schedule);
  if (!schedule.ok) return { error: schedule.error, status: 400 };

  const roleInput = validateAssignmentRoleInput(
    definition.assignmentInputSchemaId,
    input.roleInput,
  );
  if (!roleInput.ok) return { error: roleInput.error, status: 400 };

  // A paused schedule stays paused through an edit; changing the wording is not
  // the same as asking for it to start again.
  const nextRunAt =
    row.status === "active" ? getNextOccurrence(schedule.schedule, new Date()) : null;

  if (row.status === "active" && !nextRunAt) {
    return { error: "This schedule never comes around. Check the days and time.", status: 400 };
  }

  const { error } = await supabase
    .from("recurring_assignments")
    .update({
      title: input.title.trim(),
      description: input.description.trim(),
      expected_outcome: input.expectedOutcome?.trim() || null,
      priority: input.priority,
      role_input_json: roleInput.value,
      role_input_schema_id: definition.assignmentInputSchemaId,
      frequency: schedule.schedule.frequency,
      interval_count: schedule.schedule.interval,
      days_of_week: schedule.schedule.daysOfWeek ?? [],
      day_of_month: schedule.schedule.dayOfMonth ?? null,
      local_time: schedule.schedule.localTime,
      timezone: schedule.schedule.timezone,
      start_date: schedule.schedule.startDate,
      conflict_policy: input.conflictPolicy === "skip" ? "skip" : "wait",
      next_run_at: nextRunAt?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recurringAssignmentId);

  if (error) return { error: "I couldn't save these changes.", status: 500 };

  // Turns queued under the old schedule are dropped rather than reinterpreted:
  // a waiting turn from "every Monday" makes no sense once the manager has said
  // "every Thursday instead".
  await supabase
    .from("recurring_assignment_occurrences")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("recurring_assignment_id", recurringAssignmentId)
    .in("status", ["scheduled", "waiting"]);

  return { nextRunAt: nextRunAt?.toISOString() ?? null };
}

export async function pauseRecurringAssignment(
  recurringAssignmentId: string,
): Promise<Result<{ status: string }>> {
  const supabase = await createClient();

  // The status filter is the lock: two pause clicks mean one updates nothing.
  const { data: updated } = await supabase
    .from("recurring_assignments")
    .update({
      status: "paused",
      paused_at: new Date().toISOString(),
      next_run_at: null,
      pause_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recurringAssignmentId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (!updated) {
    const { data: current } = await supabase
      .from("recurring_assignments")
      .select("status")
      .eq("id", recurringAssignmentId)
      .maybeSingle();

    if (!current) return { error: "Recurring assignment not found.", status: 404 };
    return { error: "This recurring assignment isn't active.", status: 409 };
  }

  await supabase
    .from("recurring_assignment_occurrences")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("recurring_assignment_id", recurringAssignmentId)
    .eq("status", "scheduled");

  return { status: "paused" };
}

/** Picks up from now, not from where it left off — the turns missed while
 *  paused were deliberately missed and creating them in a burst would be the
 *  opposite of what pausing meant. */
export async function resumeRecurringAssignment(
  recurringAssignmentId: string,
): Promise<Result<{ status: string; nextRunAt: string }>> {
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("recurring_assignments")
    .select("*")
    .eq("id", recurringAssignmentId)
    .maybeSingle<RecurringAssignmentRow>();

  if (!row) return { error: "Recurring assignment not found.", status: 404 };
  if (row.status !== "paused") {
    return { error: "This recurring assignment isn't paused.", status: 409 };
  }

  const nextRunAt = getNextOccurrence(scheduleOf(row), new Date());
  if (!nextRunAt) {
    return { error: "This schedule never comes around. Edit it before resuming.", status: 409 };
  }

  const { data: updated } = await supabase
    .from("recurring_assignments")
    .update({
      status: "active",
      paused_at: null,
      pause_reason: null,
      next_run_at: nextRunAt.toISOString(),
      consecutive_failure_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recurringAssignmentId)
    .eq("status", "paused")
    .select("id")
    .maybeSingle();

  if (!updated) return { error: "This recurring assignment isn't paused.", status: 409 };

  return { status: "active", nextRunAt: nextRunAt.toISOString() };
}

export async function endRecurringAssignment(
  recurringAssignmentId: string,
): Promise<Result<{ status: string }>> {
  const supabase = await createClient();

  const { data: updated } = await supabase
    .from("recurring_assignments")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      next_run_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recurringAssignmentId)
    .in("status", ["active", "paused"])
    .select("id")
    .maybeSingle();

  if (!updated) {
    const { data: current } = await supabase
      .from("recurring_assignments")
      .select("status")
      .eq("id", recurringAssignmentId)
      .maybeSingle();

    if (!current) return { error: "Recurring assignment not found.", status: 404 };
    return { error: "This recurring assignment has already ended.", status: 409 };
  }

  // Work already created stands — ending a schedule stops future turns, it does
  // not undo what the employee has already done.
  await supabase
    .from("recurring_assignment_occurrences")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("recurring_assignment_id", recurringAssignmentId)
    .in("status", ["scheduled", "waiting"]);

  return { status: "ended" };
}

export function scheduleOf(row: RecurringAssignmentRow) {
  return {
    frequency: row.frequency,
    interval: row.interval_count,
    daysOfWeek: row.days_of_week,
    dayOfMonth: row.day_of_month ?? undefined,
    localTime: row.local_time,
    timezone: row.timezone,
    startDate: row.start_date,
  };
}

/**
 * Moves every schedule to a new company time zone, keeping the wall-clock time
 * the manager chose. "Every Monday at 9am" stays 9am; only the instant behind
 * it changes.
 */
export async function applyCompanyTimezone(
  companyId: string,
  timezone: string,
): Promise<number> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("recurring_assignments")
    .select("*")
    .eq("company_id", companyId)
    .in("status", ["active", "paused"]);

  let updated = 0;

  for (const row of (rows ?? []) as RecurringAssignmentRow[]) {
    const schedule = { ...scheduleOf(row), timezone };
    const nextRunAt =
      row.status === "active" ? getNextOccurrence(schedule, new Date()) : null;

    await supabase
      .from("recurring_assignments")
      .update({
        timezone,
        next_run_at: nextRunAt?.toISOString() ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    updated += 1;
  }

  return updated;
}
