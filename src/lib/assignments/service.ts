import { createClient } from "@/lib/supabase/server";
import { getOwnedCompanyEmployee, type OwnedCompanyEmployee } from "@/lib/onboarding/access";
import { initialProgressSteps } from "@/lib/assignments/progress";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { validateAssignmentRoleInput } from "@/lib/roles/schemas";
import {
  validateAssignmentInput,
  type AssignmentInput,
} from "@/lib/assignments/validation";
import type {
  Assignment,
  Employee,
  EmployeeWorkContext,
  KnowledgeProfile,
} from "@/lib/types";

export type Failure = {
  error: string;
  status: number;
  /** Set when the caller should be sent to the resource that blocked them. */
  assignmentId?: string;
  deliverableId?: string;
  executionId?: string;
};
export type Result<T> = T | Failure;

export function isFailure<T>(result: Result<T>): result is Failure {
  return typeof result === "object" && result !== null && "error" in result;
}

/**
 * Assignment states that still occupy the employee. Mirrors the partial unique
 * index in the schema — a revision in progress still blocks new work.
 */
export const ACTIVE_ASSIGNMENT_STATUSES = [
  "assigned",
  "queued",
  "working",
  "submitted",
  "needs_changes",
  "revision_queued",
  "revising",
  "failed",
] as const;

/**
 * Finds the assignment currently occupying an employee, if any.
 *
 * Includes work they are doing for a colleague: they are genuinely busy, and
 * handing them a second job because the first one came from a teammate rather
 * than the manager would break the one-thing-at-a-time rule everything else
 * relies on. Callers that must not *show* internal work filter it themselves.
 */
export async function getActiveAssignment(
  owned: OwnedCompanyEmployee,
): Promise<Assignment | null> {
  const { data } = await owned.supabase
    .from("assignments")
    .select("*")
    .eq("company_employee_id", owned.companyEmployee.id)
    .in("status", [...ACTIVE_ASSIGNMENT_STATUSES])
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as Assignment | null) ?? null;
}

export async function createAssignment(
  owned: OwnedCompanyEmployee,
  input: AssignmentInput,
): Promise<Result<{ assignmentId: string; queued: boolean }>> {
  const { supabase, companyEmployee, employee } = owned;

  if (companyEmployee.onboarding_status !== "completed") {
    return {
      error: `${employee.name} is not ready for work yet. Complete onboarding before assigning work.`,
      status: 409,
    };
  }

  // Somebody already working does not refuse the work — they queue it.
  //
  // Refusing made the manager the scheduler: come back later, remember what
  // you wanted, type it again. Hiring someone is supposed to remove that job,
  // not create it. The employee still does one thing at a time; what changed
  // is who holds the list.
  const active = await getActiveAssignment(owned);
  const queueing = active !== null;

  const validationError = validateAssignmentInput(input);
  if (validationError) {
    return { error: validationError, status: 400 };
  }

  const expectedOutcome = (input.expectedOutcome ?? "").trim();

  const definition = getEmployeeDefinition(employee.slug);
  if (!definition) {
    return { error: "This employee isn't available.", status: 400 };
  }

  // Role input is validated here rather than trusted from the form: the form
  // shapes it, but the request body is the thing that reaches the database.
  const roleInput = validateAssignmentRoleInput(
    definition.assignmentInputSchemaId,
    input.roleInput,
  );
  if (!roleInput.ok) {
    return { error: roleInput.error, status: 400 };
  }

  const { data: created, error: insertError } = await supabase
    .from("assignments")
    .insert({
      company_id: companyEmployee.company_id,
      company_employee_id: companyEmployee.id,
      title: input.title.trim(),
      description: input.description.trim(),
      expected_outcome: expectedOutcome || null,
      priority: input.priority,
      status: queueing ? "waiting" : "assigned",
      current_progress_step: queueing ? null : "assignment_received",
      role_input_json: roleInput.value,
      role_input_schema_id: definition.assignmentInputSchemaId,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    // The partial unique index is the last line of defence against a double submit.
    const raced = await getActiveAssignment(owned);
    if (raced) {
      return {
        error: `${employee.name} is already working on an assignment.`,
        status: 409,
        assignmentId: raced.id,
      };
    }
    return {
      error: `I couldn't assign this work to ${employee.name}.`,
      status: 500,
    };
  }

  const assignmentId = created.id as string;

  // Queued work gets no progress trail and does not touch the employee's
  // status. Both describe what somebody is doing right now, and this is not
  // being done — writing "assignment received" against it would put a piece of
  // work into a state it will re-enter properly when it actually starts.
  if (queueing) {
    return { assignmentId, queued: true };
  }

  await supabase.from("assignment_progress_events").insert(
    initialProgressSteps.map((step, index) => ({
      assignment_id: assignmentId,
      event_type: step.eventType,
      title: step.title,
      sequence: index,
      status: index === 0 ? "completed" : "pending",
      completed_at: index === 0 ? new Date().toISOString() : null,
    })),
  );

  await supabase
    .from("company_employees")
    .update({ work_status: "assigned", current_assignment_id: assignmentId })
    .eq("id", companyEmployee.id);

  return { assignmentId, queued: false };
}

/**
 * Moves the oldest queued assignment into the started state.
 *
 * Called when an employee becomes free. It does not execute anything — it puts
 * the work into exactly the state a freshly assigned piece of work is in, so
 * the same path that starts a normal assignment starts this one, and there is
 * only one way for work to begin.
 *
 * Returns the assignment it started, or null when the queue was empty or
 * somebody had already taken the slot.
 */
export async function startNextQueued(
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  db: any,
  companyEmployeeId: string,
): Promise<string | null> {
  // Nothing may start while something is running. Checked here rather than
  // relying on the unique index alone, so the common case fails quietly
  // instead of as a database error.
  const { data: busy } = await db
    .from("assignments")
    .select("id")
    .eq("company_employee_id", companyEmployeeId)
    .in("status", [...ACTIVE_ASSIGNMENT_STATUSES])
    .limit(1)
    .maybeSingle();

  if (busy) return null;

  const { data: next } = await db
    .from("assignments")
    .select("id")
    .eq("company_employee_id", companyEmployeeId)
    .eq("status", "waiting")
    .is("role_input_json->awaitingApproval", null) // 42회차: 사람 답을 기다리는 판은 대기열이 집지 않는다
    // First in, first out. Priority decides what the manager should look at,
    // not what an employee picks up — a high-priority item added later
    // jumping the queue would quietly delay work already promised.
    .order("assigned_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!next) return null;

  const assignmentId = next.id as string;

  // Conditional on the row still being queued, so two callers racing to free
  // the same employee cannot both start it.
  const { data: claimed } = await db
    .from("assignments")
    .update({ status: "assigned", current_progress_step: "assignment_received" })
    .eq("id", assignmentId)
    .eq("status", "waiting")
    .is("role_input_json->awaitingApproval", null) // 42회차: 사람 답을 기다리는 판은 대기열이 집지 않는다
    .select("id")
    .maybeSingle();

  if (!claimed) return null;

  await db.from("assignment_progress_events").insert(
    initialProgressSteps.map((step, index) => ({
      assignment_id: assignmentId,
      event_type: step.eventType,
      title: step.title,
      sequence: index,
      status: index === 0 ? "completed" : "pending",
      completed_at: index === 0 ? new Date().toISOString() : null,
    })),
  );

  await db
    .from("company_employees")
    .update({ work_status: "assigned", current_assignment_id: assignmentId })
    .eq("id", companyEmployeeId);

  return assignmentId;
}

/**
 * Moves an assignment from `assigned` to `working`. Safe to retry: an
 * assignment that is already working is treated as success.
 */
export async function startAssignment(assignmentId: string): Promise<Result<{ ok: true }>> {
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle<Assignment>();

  if (!assignment) {
    return { error: "Assignment not found.", status: 404 };
  }

  if (assignment.status === "working") {
    return { ok: true };
  }

  if (assignment.status !== "assigned") {
    return { error: "This assignment can no longer be started.", status: 409 };
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("assignments")
    .update({
      status: "working",
      started_at: now,
      current_progress_step: "research_started",
      updated_at: now,
    })
    .eq("id", assignmentId)
    .eq("status", "assigned");

  if (updateError) {
    return { error: "Could not start working on this assignment.", status: 500 };
  }

  await supabase
    .from("assignment_progress_events")
    .update({ status: "completed", completed_at: now })
    .eq("assignment_id", assignmentId)
    .eq("event_type", "company_context_reviewed");

  await supabase
    .from("assignment_progress_events")
    .update({ status: "active" })
    .eq("assignment_id", assignmentId)
    .eq("event_type", "research_started");

  await supabase
    .from("company_employees")
    .update({ work_status: "working" })
    .eq("id", assignment.company_employee_id);

  return { ok: true };
}

/**
 * Assembles everything an employee needs to work: who they are, what they were
 * taught about the company during onboarding, and the assignment itself.
 * Day 3 builds and validates this context but does not send it anywhere.
 */
export async function buildEmployeeWorkContext(
  assignmentId: string,
): Promise<EmployeeWorkContext | null> {
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle<Assignment>();

  if (!assignment) return null;

  const owned = await getOwnedCompanyEmployee(assignment.company_employee_id);
  if (!owned) return null;

  const { data: profile } = await supabase
    .from("employee_knowledge_profiles")
    .select("*")
    .eq("company_employee_id", assignment.company_employee_id)
    .maybeSingle<KnowledgeProfile>();

  if (!profile) return null;

  const employee: Employee = owned.employee;

  return {
    employee: {
      name: employee.name,
      role: employee.role,
      slug: employee.slug,
    },
    companyKnowledge: {
      companySummary: profile.company_summary ?? "",
      customerSummary: profile.customer_summary ?? "",
      problemSummary: profile.problem_summary ?? "",
      differentiationSummary: profile.differentiation_summary ?? undefined,
      competitors: profile.competitors ?? [],
      priorities: profile.priorities ?? [],
      additionalContext: profile.additional_context ?? undefined,
    },
    assignment: {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      expectedOutcome: assignment.expected_outcome ?? undefined,
      priority: assignment.priority,
    },
  };
}

/**
 * 사람을 풀어 준다 — 대화가 유일한 화면이 된 뒤의 규칙.
 *
 * 한 사람은 한 번에 한 일만 한다(부분 유니크 인덱스). 그런데 그 '한 일'에
 * **실패한 일**과 **다 해서 넘긴 일(submitted)** 도 들어간다. 전에는 업무 화면에서
 * 매니저가 다시 시키거나 승인해서 풀었는데, 그 화면은 09-05 에 지웠다. 그러자
 * 14:12 에 실제로 이렇게 됐다: Dev 의 첫 일이 실패 → 다시 시키니 "대기열" →
 * 아무도 안 꺼내 줘서 영영 대기.
 *
 * 그래서 이제 결과가 대화에 붙는 순간이 곧 승인이고, 실패는 접는 것이다:
 * - failed   → cancelled (다시 하려면 다시 말하면 된다)
 * - submitted → completed (매니저가 대화에서 봤다)
 * 그리고 기다리던 다음 일이 있으면 꺼내서 시작을 건다.
 *
 * `only` 를 주면 그 업무만 푼다(결과를 방금 붙인 그것). 없으면 그 사람의 막힌
 * 것을 전부 푼다(새 일을 시키기 직전).
 */
export async function releaseEmployee(
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  db: any,
  companyEmployeeId: string,
  only?: string,
): Promise<{ released: string[]; started: string | null }> {
  let q = db
    .from("assignments")
    .select("id, status")
    .eq("company_employee_id", companyEmployeeId)
    .in("status", ["failed", "submitted"]);
  if (only) q = q.eq("id", only);
  const { data: stuck } = await q;

  const released: string[] = [];
  const now = new Date().toISOString();
  for (const a of (stuck ?? []) as { id: string; status: string }[]) {
    const patch =
      a.status === "failed"
        ? { status: "cancelled", cancelled_at: now }
        : { status: "completed", completed_at: now };
    const { data: done } = await db
      .from("assignments")
      .update(patch)
      .eq("id", a.id)
      .eq("status", a.status)
      .select("id")
      .maybeSingle();
    if (done) released.push(a.id);
  }

  if (released.length) {
    await db
      .from("company_employees")
      .update({ work_status: "ready", current_assignment_id: null })
      .eq("id", companyEmployeeId);
  }

  const started = await startNextQueued(db, companyEmployeeId);
  if (started) {
    // 기다리지 않는다 — 실행은 몇 분이고 이 호출은 지금 답해야 한다.
    void import("@/lib/execution/service")
      .then(({ startExecution }) => startExecution(started))
      .catch(() => {});
  }
  return { released, started };
}
