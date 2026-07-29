import { NextResponse } from "next/server";
import { getOwnedExecution } from "@/lib/execution/access";
import { executionStepLabel, type ExecutionStep } from "@/lib/execution/types";
import { leadResearchStepLabel } from "@/lib/leads/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ executionId: string }> },
) {
  const { executionId } = await params;
  const owned = await getOwnedExecution(executionId);

  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { execution } = owned;
  const step = execution.current_step as string | null;

  // Steps differ by role — "Checking company fit" means nothing for a research
  // report — so the label is looked up across both vocabularies rather than the
  // caller having to know which employee it is watching.
  const displayStatus = step
    ? (executionStepLabel[step as ExecutionStep] ??
      leadResearchStepLabel[step] ??
      null)
    : null;

  const metrics = execution.metrics_json as
    | { candidateCount?: number; selectedCount?: number }
    | null;

  // Deliberately narrow: status, a human-readable step, and counts. No prompts,
  // no research plan, no raw model output, no provider error bodies.
  return NextResponse.json({
    status: execution.status,
    currentStep: execution.current_step,
    displayStatus,
    attemptNumber: execution.attempt_number,
    searchesCompleted: execution.search_request_count,
    sourcesReviewed: execution.source_fetch_count,
    companiesFound: metrics?.candidateCount ?? null,
    companiesSelected: metrics?.selectedCount ?? null,
    startedAt: execution.started_at,
    completedAt: execution.completed_at,
    failedAt: execution.failed_at,
  });
}
