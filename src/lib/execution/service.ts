import { getOwnedAssignment } from "@/lib/assignments/access";
import { createClient } from "@/lib/supabase/server";
import { executeEmployeeAssignment } from "@/lib/execution/engine";
import type { Result } from "@/lib/assignments/service";
import { blockedBySpendLimit } from "@/lib/costs/allowance";

/**
 * Creates a work execution and runs it. Day 5 has no queue — the run happens
 * inline — but the execution row exists from the moment work is accepted, so
 * state is durable whether or not the caller stays connected.
 */
export async function startExecution(
  assignmentId: string,
): Promise<Result<{ executionId: string }>> {
  const owned = await getOwnedAssignment(assignmentId);
  if (!owned) {
    return { error: "Assignment not found.", status: 404 };
  }

  const { supabase, assignment, companyEmployee, employee } = owned;

  if (companyEmployee.onboarding_status !== "completed") {
    return {
      error: `${employee.name} is not ready for work yet.`,
      status: 409,
    };
  }

  // Refused before an execution row exists. The engine checks again — it is the
  // last line and other paths reach it — but stopping here is what the manager
  // sees: work that never started, rather than work that appeared to start and
  // then failed for a reason that was already known.
  const blocked = await blockedBySpendLimit(supabase, assignment.company_id);
  if (blocked) return { error: blocked, status: 402 };

  const { data: active } = await supabase
    .from("work_executions")
    .select("id, status")
    .eq("assignment_id", assignmentId)
    .in("status", ["queued", "running"])
    .maybeSingle();

  if (active) {
    return {
      error: `${employee.name} is already working on this assignment.`,
      status: 409,
      executionId: active.id as string,
    };
  }

  if (!["assigned", "queued", "working", "failed", "needs_changes"].includes(assignment.status)) {
    return { error: "This assignment is not ready to be worked on.", status: 409 };
  }

  const { data: previous } = await supabase
    .from("work_executions")
    .select("attempt_number")
    .eq("assignment_id", assignmentId)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const attemptNumber = ((previous?.attempt_number as number | undefined) ?? 0) + 1;

  const { data: created, error: insertError } = await supabase
    .from("work_executions")
    .insert({
      company_id: assignment.company_id,
      assignment_id: assignmentId,
      company_employee_id: companyEmployee.id,
      status: "queued",
      current_step: "context_loaded",
      attempt_number: attemptNumber,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    // The partial unique index is the last defence against a double start.
    const { data: raced } = await supabase
      .from("work_executions")
      .select("id")
      .eq("assignment_id", assignmentId)
      .in("status", ["queued", "running"])
      .maybeSingle();

    if (raced) {
      return {
        error: `${employee.name} is already working on this assignment.`,
        status: 409,
        executionId: raced.id as string,
      };
    }
    return { error: "Could not start this work.", status: 500 };
  }

  const executionId = created.id as string;

  await supabase
    .from("assignments")
    .update({ status: "queued", last_execution_id: executionId, failure_reason: null })
    .eq("id", assignmentId);

  await supabase
    .from("company_employees")
    .update({ work_status: "working" })
    .eq("id", companyEmployee.id);

  await executeEmployeeAssignment(executionId);

  return { executionId };
}

export async function getExecutionForAssignment(assignmentId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("work_executions")
    .select("*")
    .eq("assignment_id", assignmentId)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}
