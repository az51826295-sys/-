import type { SupabaseClient } from "@supabase/supabase-js";
import { executeEmployeeAssignment } from "@/lib/execution/engine";
import { defaultProviders } from "@/lib/execution/shared";
import { createClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

/**
 * Starts the work behind a scheduled assignment.
 *
 * Kept apart from the scheduling pass so a research run that takes minutes
 * never delays the next tick or leaves a turn half-scheduled. The execution row
 * is created here — the same row a manually started assignment gets — and from
 * that point on nothing downstream knows or cares that a timer began it.
 */
export async function startScheduledExecution(
  db: Db,
  assignmentId: string,
): Promise<{ ok: boolean; executionId?: string }> {
  const { data: assignment } = await db
    .from("assignments")
    .select("id, company_id, company_employee_id, status")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!assignment) return { ok: false };

  // Someone may have opened the assignment and started it by hand between the
  // scheduler creating it and this call.
  const { data: active } = await db
    .from("work_executions")
    .select("id")
    .eq("assignment_id", assignmentId)
    .in("status", ["queued", "running"])
    .maybeSingle();

  if (active) return { ok: true, executionId: active.id as string };

  const { data: previous } = await db
    .from("work_executions")
    .select("attempt_number")
    .eq("assignment_id", assignmentId)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const attemptNumber =
    ((previous?.attempt_number as number | undefined) ?? 0) + 1;

  const { data: created } = await db
    .from("work_executions")
    .insert({
      company_id: assignment.company_id,
      assignment_id: assignmentId,
      company_employee_id: assignment.company_employee_id,
      status: "queued",
      current_step: "context_loaded",
      attempt_number: attemptNumber,
    })
    .select("id")
    .single();

  if (!created) {
    // The partial unique index is the last defence against a double start.
    const { data: raced } = await db
      .from("work_executions")
      .select("id")
      .eq("assignment_id", assignmentId)
      .in("status", ["queued", "running"])
      .maybeSingle();

    return raced ? { ok: true, executionId: raced.id as string } : { ok: false };
  }

  const executionId = created.id as string;

  await db
    .from("assignments")
    .update({ status: "queued", last_execution_id: executionId, failure_reason: null })
    .eq("id", assignmentId);

  await db
    .from("company_employees")
    .update({ work_status: "working" })
    .eq("id", assignment.company_employee_id);

  // The scheduler's client is passed straight through: there is no session to
  // build one from, and the engine needs a way to reach the database.
  await executeEmployeeAssignment(
    executionId,
    defaultProviders(),
    db as unknown as Awaited<ReturnType<typeof createClient>>,
  );

  return { ok: true, executionId };
}
