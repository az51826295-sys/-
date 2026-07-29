import { NextResponse } from "next/server";
import { getOwnedRevisionRequest } from "@/lib/revisions/access";
import { revisionStepLabel, type RevisionStep } from "@/lib/execution/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ revisionRequestId: string }> },
) {
  const { revisionRequestId } = await params;
  const owned = await getOwnedRevisionRequest(revisionRequestId);

  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { supabase, request } = owned;

  const { data: execution } = await supabase
    .from("work_executions")
    .select("current_step, status, attempt_number")
    .eq("revision_request_id", revisionRequestId)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const step = execution?.current_step as RevisionStep | null;

  // Status and a readable step only — no feedback analysis, no prompts.
  return NextResponse.json({
    status: request.status,
    currentStep: execution?.current_step ?? null,
    displayStatus: step ? revisionStepLabel[step] : null,
    targetVersion: request.target_version,
    attemptNumber: execution?.attempt_number ?? null,
  });
}
