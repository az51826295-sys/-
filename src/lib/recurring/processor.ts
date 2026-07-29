import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmployeeSkill } from "@/lib/skills/registry";
import { SkillNotFoundError } from "@/lib/skills/types";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { validateAssignmentRoleInput } from "@/lib/roles/schemas";
import { getNextOccurrence } from "@/lib/schedule/recurrence";
import { initialProgressSteps } from "@/lib/assignments/progress";
import { scheduleOf } from "@/lib/recurring/service";
import {
  BUSY_WORK_STATUSES,
  MAX_CONSECUTIVE_SCHEDULE_FAILURES,
  SCHEDULER_BATCH_LIMIT,
  WAITING_OCCURRENCE_MAX_AGE_DAYS,
  type OccurrenceRow,
  type RecurringAssignmentRow,
  type ScheduleFailureCode,
} from "@/lib/recurring/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export interface SchedulerReport {
  due: number;
  occurrencesCreated: number;
  assignmentsCreated: number;
  waiting: number;
  skipped: number;
  failed: number;
  waitingResumed: number;
  waitingExpired: number;
}

/**
 * One pass of the scheduler.
 *
 * Every step is written to survive being run twice at once. There is no lock:
 * the unique constraint on (recurring_assignment_id, scheduled_for) is what
 * makes a duplicate pass harmless, and advancing next_run_at is done with a
 * conditional update so the loser of a race changes nothing rather than
 * skipping a turn.
 *
 * Deliberately does not wait for the work itself. Creating the assignment and
 * starting it is the scheduler's job; a research run takes minutes and has no
 * business inside a timer tick.
 */
export async function runSchedulerPass(
  db: Db,
  now: Date = new Date(),
): Promise<SchedulerReport> {
  const report: SchedulerReport = {
    due: 0,
    occurrencesCreated: 0,
    assignmentsCreated: 0,
    waiting: 0,
    skipped: 0,
    failed: 0,
    waitingResumed: 0,
    waitingExpired: 0,
  };

  report.waitingExpired = await expireStaleWaiting(db, now);

  const { data: due } = await db
    .from("recurring_assignments")
    .select("*")
    .eq("status", "active")
    .not("next_run_at", "is", null)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(SCHEDULER_BATCH_LIMIT);

  const rows = (due ?? []) as RecurringAssignmentRow[];
  report.due = rows.length;

  for (const row of rows) {
    const scheduledFor = row.next_run_at!;

    // Advance first. If anything below fails, the schedule still moves on to
    // its next turn rather than retrying the same one for ever.
    await advanceNextRun(db, row, scheduledFor);

    // Null means another pass owns this turn; doing nothing is the correct
    // response, not an error.
    const occurrence = await claimOccurrence(db, row, scheduledFor);
    if (!occurrence) continue;
    report.occurrencesCreated += 1;

    const outcome = await processOccurrence(db, row, occurrence, now);
    if (outcome === "assignment_created") report.assignmentsCreated += 1;
    else if (outcome === "waiting") report.waiting += 1;
    else if (outcome === "skipped") report.skipped += 1;
    else if (outcome === "failed") report.failed += 1;
  }

  report.waitingResumed = await startReadyWaitingOccurrences(db, now);

  return report;
}

/**
 * Moves the schedule on to its next turn.
 *
 * Computed from the turn that was due rather than from now, so a tick that runs
 * late doesn't drag the whole schedule later with it.
 *
 * The guard compares against the exact string Postgres gave us. Passing a Date
 * through toISOString() would drop microseconds and never match, leaving the
 * schedule pinned to a time already in the past and spinning on every tick.
 */
async function advanceNextRun(
  db: Db,
  row: RecurringAssignmentRow,
  storedNextRunAt: string,
): Promise<void> {
  const next = getNextOccurrence(scheduleOf(row), new Date(storedNextRunAt));

  await db
    .from("recurring_assignments")
    .update({
      next_run_at: next?.toISOString() ?? null,
      last_run_at: storedNextRunAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    // Only if nobody else has moved it: the conditional update is the whole
    // concurrency story for this field.
    .eq("next_run_at", storedNextRunAt);
}

/**
 * Takes ownership of this turn, or returns null if somebody else already has it.
 *
 * Creating the row and claiming it are the same act: the insert sets
 * "processing" directly, so a second pass that loses the unique constraint
 * cannot then read the row back and process it in parallel. Only a turn still
 * sitting at "scheduled" — left behind by a pass that died — can be picked up,
 * and then only by whichever caller wins the conditional update.
 */
async function claimOccurrence(
  db: Db,
  row: RecurringAssignmentRow,
  scheduledFor: string,
): Promise<OccurrenceRow | null> {
  const { data: inserted } = await db
    .from("recurring_assignment_occurrences")
    .insert({
      company_id: row.company_id,
      recurring_assignment_id: row.id,
      company_employee_id: row.company_employee_id,
      scheduled_for: scheduledFor,
      status: "processing",
      started_at: new Date().toISOString(),
    })
    .select("*")
    .maybeSingle();

  if (inserted) return inserted as OccurrenceRow;

  // The turn already exists. Claim it only if nothing has started on it —
  // anything else means another pass is handling it or already finished.
  const { data: claimed } = await db
    .from("recurring_assignment_occurrences")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("recurring_assignment_id", row.id)
    .eq("scheduled_for", scheduledFor)
    .eq("status", "scheduled")
    .select("*")
    .maybeSingle();

  return (claimed as OccurrenceRow | null) ?? null;
}

type OccurrenceOutcome = "assignment_created" | "waiting" | "skipped" | "failed";

async function processOccurrence(
  db: Db,
  row: RecurringAssignmentRow,
  occurrence: OccurrenceRow,
  now: Date,
): Promise<OccurrenceOutcome> {
  const check = await checkEmployeeReady(db, row);

  if (check.kind === "unavailable") {
    // Something is wrong with the employee, not with this particular turn, so
    // the schedule stops rather than failing the same way every week.
    await failOccurrence(db, row, occurrence, check.code, check.message);
    await pauseForReason(db, row, check.message);
    return "failed";
  }

  if (check.kind === "busy") {
    if (row.conflict_policy === "skip") {
      await skipOccurrence(db, occurrence, check.reason);
      return "skipped";
    }

    const { data: waiting } = await db
      .from("recurring_assignment_occurrences")
      .update({ status: "waiting", updated_at: now.toISOString() })
      .eq("id", occurrence.id)
      .select("id")
      .maybeSingle();

    // The partial unique index refuses a second waiting turn for this schedule.
    // That refusal is the feature: the manager wants one pending piece of work,
    // not a backlog built while they were away.
    if (!waiting) {
      await skipOccurrence(
        db,
        occurrence,
        "A previous scheduled assignment is still waiting.",
      );
      return "skipped";
    }

    return "waiting";
  }

  const created = await createAssignmentForOccurrence(db, row, occurrence, now);
  return created ? "assignment_created" : "failed";
}

type ReadyCheck =
  | { kind: "ready" }
  | { kind: "busy"; reason: string }
  | { kind: "unavailable"; code: ScheduleFailureCode; message: string };

async function checkEmployeeReady(
  db: Db,
  row: RecurringAssignmentRow,
): Promise<ReadyCheck> {
  const { data: hire } = await db
    .from("company_employees")
    .select("id, onboarding_status, work_status, employees(name, slug)")
    .eq("id", row.company_employee_id)
    .maybeSingle();

  if (!hire) {
    return {
      kind: "unavailable",
      code: "EMPLOYEE_UNAVAILABLE",
      message: "This employee is no longer available for scheduled work.",
    };
  }

  const employee = (hire as unknown as {
    employees: { name: string; slug: string };
  }).employees;
  const name = employee?.name ?? "This employee";

  if (hire.onboarding_status !== "completed") {
    return {
      kind: "unavailable",
      code: "EMPLOYEE_NOT_ONBOARDED",
      message: `${name} needs to finish onboarding before scheduled work can start.`,
    };
  }

  const definition = getEmployeeDefinition(employee?.slug ?? "");
  if (!definition) {
    return {
      kind: "unavailable",
      code: "EMPLOYEE_SKILL_NOT_FOUND",
      message: `${name} is not available for scheduled work.`,
    };
  }

  try {
    getEmployeeSkill(definition.skillId);
  } catch (error) {
    if (error instanceof SkillNotFoundError) {
      return {
        kind: "unavailable",
        code: "EMPLOYEE_SKILL_NOT_FOUND",
        message: `${name} is not available for scheduled work.`,
      };
    }
    throw error;
  }

  if (hire.work_status === "awaiting_review") {
    return {
      kind: "busy",
      reason: `The previous deliverable is still waiting for review.`,
    };
  }

  if (BUSY_WORK_STATUSES.includes(hire.work_status as string)) {
    return {
      kind: "busy",
      reason: `${name} was working on another assignment.`,
    };
  }

  return { kind: "ready" };
}

/**
 * Copies the schedule's current wording into a standalone assignment.
 *
 * A snapshot rather than a reference: editing the schedule next month must not
 * rewrite what the employee was asked to do last month, because the deliverable
 * sitting underneath it answered the old wording.
 */
async function createAssignmentForOccurrence(
  db: Db,
  row: RecurringAssignmentRow,
  occurrence: OccurrenceRow,
  now: Date,
): Promise<boolean> {
  try {
    // Re-checked at run time, not trusted from when the schedule was saved: an
    // employee's role schema can change between then and now.
    const { data: hire } = await db
      .from("company_employees")
      .select("employees(slug)")
      .eq("id", row.company_employee_id)
      .maybeSingle();

    const slug = (hire as { employees: { slug: string } } | null)?.employees?.slug ?? "";
    const definition = getEmployeeDefinition(slug);

    if (!definition) {
      await failOccurrence(
        db,
        row,
        occurrence,
        "EMPLOYEE_SKILL_NOT_FOUND",
        "This employee is not ready for recurring work.",
      );
      return false;
    }

    const roleInput = validateAssignmentRoleInput(
      definition.assignmentInputSchemaId,
      row.role_input_json,
    );
    if (!roleInput.ok) {
      await failOccurrence(
        db,
        row,
        occurrence,
        "INVALID_ROLE_INPUT",
        "The saved work settings are no longer valid.",
      );
      return false;
    }

    const { data: assignment, error } = await db
      .from("assignments")
      .insert({
        company_id: row.company_id,
        company_employee_id: row.company_employee_id,
        title: row.title,
        description: row.description,
        expected_outcome: row.expected_outcome,
        priority: row.priority,
        status: "assigned",
        current_progress_step: "assignment_received",
        role_input_json: roleInput.value,
        role_input_schema_id: definition.assignmentInputSchemaId,
        source_type: "recurring",
        recurring_assignment_id: row.id,
        recurring_occurrence_id: occurrence.id,
      })
      .select("id")
      .single();

    if (error || !assignment) {
      await failOccurrence(
        db,
        row,
        occurrence,
        "ASSIGNMENT_CREATE_FAILED",
        "The scheduled assignment could not be created.",
      );
      return false;
    }

    const assignmentId = assignment.id as string;

    await db.from("assignment_progress_events").insert(
      initialProgressSteps.map((step, index) => ({
        assignment_id: assignmentId,
        event_type: step.eventType,
        title: step.title,
        sequence: index,
        status: index === 0 ? "completed" : "pending",
        completed_at: index === 0 ? now.toISOString() : null,
      })),
    );

    await db
      .from("recurring_assignment_occurrences")
      .update({
        status: "assignment_created",
        assignment_id: assignmentId,
        completed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", occurrence.id);

    await db
      .from("recurring_assignments")
      .update({ consecutive_failure_count: 0, updated_at: now.toISOString() })
      .eq("id", row.id);

    await db
      .from("company_employees")
      .update({ work_status: "assigned", current_assignment_id: assignmentId })
      .eq("id", row.company_employee_id);

    return true;
  } catch (error) {
    await failOccurrence(
      db,
      row,
      occurrence,
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "Unknown error",
    );
    return false;
  }
}

/** Terminal states are only reachable from a turn still being worked on, so a
 *  late writer can never mark a turn that already produced an assignment as
 *  skipped or failed. */
const IN_FLIGHT = ["scheduled", "processing", "waiting"];

async function skipOccurrence(db: Db, occurrence: OccurrenceRow, reason: string) {
  const now = new Date().toISOString();
  await db
    .from("recurring_assignment_occurrences")
    .update({
      status: "skipped",
      skip_reason: reason,
      skipped_at: now,
      updated_at: now,
    })
    .eq("id", occurrence.id)
    .in("status", IN_FLIGHT);
}

async function failOccurrence(
  db: Db,
  row: RecurringAssignmentRow,
  occurrence: OccurrenceRow,
  code: ScheduleFailureCode,
  message: string,
) {
  const now = new Date().toISOString();

  const { data: marked } = await db
    .from("recurring_assignment_occurrences")
    .update({
      status: "failed",
      failure_code: code,
      failure_message: message.slice(0, 500),
      failed_at: now,
      updated_at: now,
    })
    .eq("id", occurrence.id)
    .in("status", IN_FLIGHT)
    .select("id")
    .maybeSingle();

  // The turn already finished under another pass. Counting this as a failure
  // would push a healthy schedule towards being paused.
  if (!marked) return;

  const failures = row.consecutive_failure_count + 1;

  await db
    .from("recurring_assignments")
    .update({
      consecutive_failure_count: failures,
      last_failure_at: now,
      updated_at: now,
    })
    .eq("id", row.id);

  if (failures >= MAX_CONSECUTIVE_SCHEDULE_FAILURES) {
    await pauseForReason(db, row, "Paused after repeated assignment failures.");
  }
}

async function pauseForReason(db: Db, row: RecurringAssignmentRow, reason: string) {
  const now = new Date().toISOString();
  await db
    .from("recurring_assignments")
    .update({
      status: "paused",
      paused_at: now,
      pause_reason: reason,
      next_run_at: null,
      updated_at: now,
    })
    .eq("id", row.id)
    .eq("status", "active");
}

/**
 * Retires waiting turns that have gone stale. A competitor review that was due
 * last week is still worth running a few days late; a month later the manager
 * would rather have this week's.
 */
async function expireStaleWaiting(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(
    now.getTime() - WAITING_OCCURRENCE_MAX_AGE_DAYS * 86_400_000,
  ).toISOString();

  const { data } = await db
    .from("recurring_assignment_occurrences")
    .update({
      status: "skipped",
      skip_reason: "The scheduled assignment became outdated while waiting.",
      skipped_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("status", "waiting")
    .lt("scheduled_for", cutoff)
    .select("id");

  return (data ?? []).length;
}

/**
 * Starts the work that was waiting for an employee who is now free.
 *
 * One per employee per pass, oldest first — an employee who has been busy for a
 * while may have several schedules waiting, and starting them all at once would
 * break the one-assignment-at-a-time rule the rest of the system relies on.
 */
export async function startReadyWaitingOccurrences(
  db: Db,
  now: Date = new Date(),
): Promise<number> {
  const { data: waiting } = await db
    .from("recurring_assignment_occurrences")
    .select("*")
    .eq("status", "waiting")
    .order("scheduled_for", { ascending: true });

  const rows = (waiting ?? []) as OccurrenceRow[];
  if (rows.length === 0) return 0;

  const handled = new Set<string>();
  let started = 0;

  for (const occurrence of rows) {
    if (handled.has(occurrence.company_employee_id)) continue;
    handled.add(occurrence.company_employee_id);

    const { data: recurring } = await db
      .from("recurring_assignments")
      .select("*")
      .eq("id", occurrence.recurring_assignment_id)
      .maybeSingle();

    if (!recurring) continue;
    const row = recurring as RecurringAssignmentRow;
    if (row.status === "ended") continue;

    const check = await checkEmployeeReady(db, row);
    if (check.kind !== "ready") continue;

    // Claim it before creating anything, so a concurrent pass can't start the
    // same waiting turn twice.
    const { data: claimed } = await db
      .from("recurring_assignment_occurrences")
      .update({ status: "processing", updated_at: now.toISOString() })
      .eq("id", occurrence.id)
      .eq("status", "waiting")
      .select("id")
      .maybeSingle();

    if (!claimed) continue;

    const ok = await createAssignmentForOccurrence(db, row, occurrence, now);
    if (ok) started += 1;
  }

  return started;
}

/**
 * Runs a failed turn again on the same occurrence.
 *
 * Reusing the row rather than making a new one keeps the schedule's history
 * honest: the manager sees one Monday, retried, not two Mondays.
 */
export async function retryOccurrence(
  db: Db,
  occurrenceId: string,
): Promise<
  | { ok: true; status: string; assignmentId?: string }
  | { ok: false; error: string; status: number }
> {
  const { data: occurrence } = await db
    .from("recurring_assignment_occurrences")
    .select("*")
    .eq("id", occurrenceId)
    .maybeSingle();

  if (!occurrence) return { ok: false, error: "Occurrence not found.", status: 404 };
  const row = occurrence as OccurrenceRow;

  const { data: recurring } = await db
    .from("recurring_assignments")
    .select("*")
    .eq("id", row.recurring_assignment_id)
    .maybeSingle();

  if (!recurring) {
    return { ok: false, error: "Recurring assignment not found.", status: 404 };
  }

  const schedule = recurring as RecurringAssignmentRow;
  if (schedule.status === "ended") {
    return { ok: false, error: "This recurring assignment has ended.", status: 409 };
  }

  const claimed = await db
    .from("recurring_assignment_occurrences")
    .update({
      status: "processing",
      failure_code: null,
      failure_message: null,
      failed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", occurrenceId)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();

  if (!claimed.data) {
    return { ok: false, error: "This scheduled assignment is no longer failed.", status: 409 };
  }

  const outcome = await processOccurrence(db, schedule, row, new Date());

  if (outcome === "assignment_created") {
    const { data: updated } = await db
      .from("recurring_assignment_occurrences")
      .select("assignment_id")
      .eq("id", occurrenceId)
      .maybeSingle();

    return {
      ok: true,
      status: outcome,
      assignmentId: (updated?.assignment_id as string | null) ?? undefined,
    };
  }

  return { ok: true, status: outcome };
}

/** Assignments created by the scheduler that haven't been started yet. Kept
 *  separate from creating them so a slow research run never holds up the tick. */
export async function findAssignmentsToStart(db: Db): Promise<string[]> {
  const { data } = await db
    .from("assignments")
    .select("id")
    .eq("source_type", "recurring")
    .eq("status", "assigned")
    .is("last_execution_id", null)
    .limit(SCHEDULER_BATCH_LIMIT);

  return (data ?? []).map((row) => row.id as string);
}
