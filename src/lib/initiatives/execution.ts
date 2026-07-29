import { createClient } from "@/lib/supabase/server";
import { executeEmployeeAssignment } from "@/lib/execution/engine";

/**
 * Starts the work behind a newly approved proposal.
 *
 * Uses the caller's own client rather than the scheduler's: a person is sitting
 * there having just clicked approve, so row level security is both available
 * and the right check.
 */
export async function startExecutionForAssignment(
  assignmentId: string,
): Promise<{ ok: boolean; executionId?: string }> {
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, company_id, company_employee_id")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!assignment) return { ok: false };

  const { data: active } = await supabase
    .from("work_executions")
    .select("id")
    .eq("assignment_id", assignmentId)
    .in("status", ["queued", "running"])
    .maybeSingle();

  if (active) return { ok: true, executionId: active.id as string };

  const { data: created } = await supabase
    .from("work_executions")
    .insert({
      company_id: assignment.company_id,
      assignment_id: assignmentId,
      company_employee_id: assignment.company_employee_id,
      status: "queued",
      current_step: "context_loaded",
      attempt_number: 1,
    })
    .select("id")
    .single();

  if (!created) return { ok: false };

  const executionId = created.id as string;

  await supabase
    .from("assignments")
    .update({ status: "queued", last_execution_id: executionId, failure_reason: null })
    .eq("id", assignmentId);

  await supabase
    .from("company_employees")
    .update({ work_status: "working" })
    .eq("id", assignment.company_employee_id);

  await executeEmployeeAssignment(executionId);

  return { ok: true, executionId };
}
