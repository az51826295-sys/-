import { createClient } from "@/lib/supabase/server";
import { getOwnedDeliverable } from "@/lib/deliverables/access";
import { validateFeedback } from "@/lib/deliverables/validation";
import { executeDeliverableRevision } from "@/lib/execution/revisionEngine";
import { MAX_REVISIONS_PER_ASSIGNMENT } from "@/lib/execution/types";
import type { Result } from "@/lib/assignments/service";

type RpcResult = {
  ok: boolean;
  reason?: string;
  revisionRequestId?: string;
  targetVersion?: number;
  latestVersion?: number;
};

/**
 * Records the manager's decision and opens a revision in one transaction, then
 * starts the work. There is no user-facing "regenerate" — asking for changes is
 * the instruction, and the employee acts on it.
 */
export async function requestChangesAndReviseDeliverable(
  deliverableId: string,
  feedback: string,
): Promise<Result<{ revisionRequestId: string; targetVersion: number }>> {
  const owned = await getOwnedDeliverable(deliverableId);
  if (!owned) {
    return { error: "Deliverable not found.", status: 404 };
  }

  const trimmed = feedback.trim();
  const validationError = validateFeedback(trimmed);
  if (validationError) {
    return { error: validationError, status: 400 };
  }

  const { supabase, employee } = owned;

  const { data, error } = await supabase.rpc("request_deliverable_changes_v2", {
    p_deliverable_id: deliverableId,
    p_feedback: trimmed,
    p_max_revisions: MAX_REVISIONS_PER_ASSIGNMENT,
  });

  if (error) {
    return { error: "I couldn't send your feedback.", status: 500 };
  }

  const result = data as RpcResult;

  if (!result.ok) {
    switch (result.reason) {
      case "not_latest_version":
        return {
          error: "This is not the latest version of the deliverable.",
          status: 409,
        };
      case "revision_limit_reached":
        return {
          error: `This assignment has reached the revision limit. You can approve the current version.`,
          status: 409,
        };
      case "feedback_too_short":
        return { error: "Add at least 10 characters of feedback.", status: 400 };
      default:
        return {
          error:
            "This deliverable has already been reviewed. Refresh the page to see its current state.",
          status: 409,
        };
    }
  }

  const revisionRequestId = result.revisionRequestId!;

  const started = await startRevisionExecution(revisionRequestId);
  if ("error" in started) {
    // The feedback is saved either way; the revision can be retried.
    return {
      error: `Your feedback was sent, but ${employee.name} could not start revising. Please try again.`,
      status: 500,
    };
  }

  return { revisionRequestId, targetVersion: result.targetVersion! };
}

/**
 * Creates a revision work execution and runs it. Retries reuse the same
 * revision request, so the target version never drifts.
 */
export async function startRevisionExecution(
  revisionRequestId: string,
): Promise<Result<{ executionId: string }>> {
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("revision_requests")
    .select("*")
    .eq("id", revisionRequestId)
    .maybeSingle();

  if (!request) {
    return { error: "Not found", status: 404 };
  }

  const { data: active } = await supabase
    .from("work_executions")
    .select("id")
    .eq("revision_request_id", revisionRequestId)
    .in("status", ["queued", "running"])
    .maybeSingle();

  if (active) {
    return {
      error: "Alex is already revising this deliverable.",
      status: 409,
      executionId: active.id as string,
    };
  }

  const { data: previous } = await supabase
    .from("work_executions")
    .select("id, attempt_number")
    .eq("assignment_id", request.assignment_id)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error: insertError } = await supabase
    .from("work_executions")
    .insert({
      company_id: request.company_id,
      assignment_id: request.assignment_id,
      company_employee_id: request.company_employee_id,
      status: "queued",
      current_step: "revision_context_loaded",
      execution_type: "revision",
      revision_request_id: revisionRequestId,
      parent_execution_id: previous?.id ?? null,
      source_deliverable_id: request.source_deliverable_id,
      target_version: request.target_version,
      attempt_number: ((previous?.attempt_number as number | undefined) ?? 0) + 1,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    const { data: raced } = await supabase
      .from("work_executions")
      .select("id")
      .eq("revision_request_id", revisionRequestId)
      .in("status", ["queued", "running"])
      .maybeSingle();

    if (raced) {
      return {
        error: "Alex is already revising this deliverable.",
        status: 409,
        executionId: raced.id as string,
      };
    }
    return { error: "Could not start this revision.", status: 500 };
  }

  const executionId = created.id as string;
  const now = new Date().toISOString();

  await supabase
    .from("revision_requests")
    .update({ status: "queued", updated_at: now })
    .eq("id", revisionRequestId);

  await supabase
    .from("assignments")
    .update({ status: "revision_queued", last_execution_id: executionId, failure_reason: null })
    .eq("id", request.assignment_id);

  await executeDeliverableRevision(executionId);

  return { executionId };
}
