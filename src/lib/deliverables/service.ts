import { createClient } from "@/lib/supabase/server";
import { getOwnedAssignment } from "@/lib/assignments/access";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import type { Result } from "@/lib/assignments/service";
import { validateFeedback } from "@/lib/deliverables/validation";
import { loadBlockingFindings } from "@/lib/policies/validation";
import type { KnowledgeProfile } from "@/lib/types";

type RpcResult = { ok: boolean; reason?: string; deliverableId?: string };

/**
 * Builds the sample deliverable for an employee and hands it in. The multi-row
 * state change (deliverable + assignment + employee + progress trail) happens
 * inside a plpgsql function so it cannot land half-applied.
 */
export async function submitDeliverable(
  assignmentId: string,
): Promise<Result<{ deliverableId: string }>> {
  const owned = await getOwnedAssignment(assignmentId);
  if (!owned) {
    return { error: "Assignment not found.", status: 404 };
  }

  const { supabase, assignment, companyEmployee, employee } = owned;

  const definition = getEmployeeDefinition(employee.slug);
  if (!definition) {
    return { error: `${employee.name} has no deliverable type configured.`, status: 500 };
  }

  const { data: profile } = await supabase
    .from("employee_knowledge_profiles")
    .select("*")
    .eq("company_employee_id", companyEmployee.id)
    .maybeSingle<KnowledgeProfile>();

  const sample = definition.deliverable.buildSample({
    assignmentTitle: assignment.title,
    companySummary: profile?.company_summary ?? undefined,
    customerSummary: profile?.customer_summary ?? undefined,
    differentiationSummary: profile?.differentiation_summary ?? undefined,
    competitors: profile?.competitors ?? [],
    priorities: profile?.priorities ?? [],
  });

  const { data, error } = await supabase.rpc("submit_deliverable", {
    p_assignment_id: assignmentId,
    p_title: sample.title,
    p_deliverable_type: definition.deliverable.type,
    p_content_markdown: sample.contentMarkdown,
  });

  if (error) {
    return {
      error: `${employee.name} finished the assignment, but the deliverable could not be submitted.`,
      status: 500,
    };
  }

  const result = data as RpcResult;

  if (!result.ok) {
    if (result.reason === "already_submitted") {
      return {
        error: "A deliverable has already been submitted for this assignment.",
        status: 409,
        deliverableId: result.deliverableId,
      };
    }
    return { error: "This assignment is not ready for a deliverable.", status: 409 };
  }

  return { deliverableId: result.deliverableId! };
}

export async function approveDeliverable(
  deliverableId: string,
): Promise<Result<{ ok: true }>> {
  const supabase = await createClient();

  // A required standard the company set is not something an approval can walk
  // past. The way out is not a confirmation dialog — it is deciding the rule
  // was wrong and turning it off, which is a decision worth making explicitly.
  const blocking = await loadBlockingFindings(supabase, deliverableId);

  if (blocking.length > 0) {
    const first = blocking[0];
    return {
      error:
        blocking.length === 1
          ? `This doesn't meet "${first.ruleTitle}" from ${first.policyName}. ${first.detail} Ask for changes, or turn that rule off in Company Standards.`
          : `This doesn't meet ${blocking.length} required standards, starting with "${first.ruleTitle}" from ${first.policyName}. Ask for changes, or relax those rules in Company Standards.`,
      status: 409,
    };
  }

  const { data, error } = await supabase.rpc("approve_deliverable", {
    p_deliverable_id: deliverableId,
  });

  if (error) {
    return { error: "I couldn't approve this deliverable.", status: 500 };
  }

  const result = data as RpcResult;

  if (!result.ok) {
    return {
      error:
        "I couldn't approve this deliverable. It may have already been reviewed. Refresh the page and try again.",
      status: 409,
    };
  }

  // Approving is what frees the employee, so it's the moment to look for
  // scheduled work that was waiting on them. Deliberately not awaited for its
  // result: a problem starting the next piece must not undo an approval that
  // has already happened.
  void releaseWaitingScheduledWork();

  // And for anything the manager queued behind this piece. Same moment, same
  // rule: the approval stands whatever happens next.
  void releaseQueuedWork(deliverableId);

  return { ok: true };
}

/**
 * Starts whatever the manager queued behind the work just approved.
 *
 * The manager queued it by explicitly assigning it, so starting it needs no
 * further permission — but it does spend money, which is why it goes through
 * the same execution path as any other assignment and hits the same spend
 * limit. Nothing here bypasses a gate; it only removes a wait.
 */
async function releaseQueuedWork(deliverableId: string): Promise<void> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const { startNextQueued } = await import("@/lib/assignments/service");
    const { startExecution } = await import("@/lib/execution/service");

    const db = createServiceClient();

    const { data: deliverable } = await db
      .from("deliverables")
      .select("company_employee_id")
      .eq("id", deliverableId)
      .maybeSingle();

    if (!deliverable) return;

    const assignmentId = await startNextQueued(
      db,
      deliverable.company_employee_id as string,
    );
    if (!assignmentId) return;

    await startExecution(assignmentId);
  } catch {
    // The work stays queued and starts the next time this employee is freed.
    // Losing a start is recoverable; losing the approval is not.
  }
}

/**
 * Starts scheduled work that was waiting for a now-free employee.
 *
 * Runs with the scheduler's own client because it does the scheduler's job.
 * Failures are swallowed on purpose — the next scheduler tick picks up anything
 * missed here, and the manager's approval must succeed regardless.
 */
async function releaseWaitingScheduledWork(): Promise<void> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const { startReadyWaitingOccurrences, findAssignmentsToStart } = await import(
      "@/lib/recurring/processor"
    );
    const { startScheduledExecution } = await import("@/lib/recurring/execution");

    const db = createServiceClient();
    const started = await startReadyWaitingOccurrences(db);
    if (started === 0) return;

    for (const assignmentId of await findAssignmentsToStart(db)) {
      await startScheduledExecution(db, assignmentId);
    }
  } catch {
    // Left for the next scheduler tick.
  }
}

export async function requestDeliverableChanges(
  deliverableId: string,
  feedback: string,
): Promise<Result<{ ok: true }>> {
  const trimmed = feedback.trim();

  const validationError = validateFeedback(trimmed);
  if (validationError) {
    return { error: validationError, status: 400 };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("request_deliverable_changes", {
    p_deliverable_id: deliverableId,
    p_feedback: trimmed,
  });

  if (error) {
    return { error: "I couldn't send your feedback.", status: 500 };
  }

  const result = data as RpcResult;

  if (!result.ok) {
    return {
      error:
        "This deliverable has already been reviewed. Refresh the page to see its current state.",
      status: 409,
    };
  }

  return { ok: true };
}
