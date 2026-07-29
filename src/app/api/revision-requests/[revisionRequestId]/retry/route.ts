import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { getOwnedRevisionRequest } from "@/lib/revisions/access";
import { startRevisionExecution } from "@/lib/revisions/service";

export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ revisionRequestId: string }> },
) {
  const { revisionRequestId } = await params;

  const owned = await getOwnedRevisionRequest(revisionRequestId);
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { supabase, request } = owned;

  if (request.status !== "failed") {
    return NextResponse.json(
      { error: "Only a failed revision can be retried." },
      { status: 409 },
    );
  }

  // If the revision already produced its version, there is nothing to retry.
  const { data: produced } = await supabase
    .from("deliverables")
    .select("id, version")
    .eq("assignment_id", request.assignment_id)
    .eq("version", request.target_version)
    .maybeSingle();

  if (produced) {
    return NextResponse.json(
      {
        error: "A newer version of this deliverable already exists.",
        latestDeliverableId: produced.id,
      },
      { status: 409 },
    );
  }

  // The source deliverable must still be the one awaiting revision.
  const { data: source } = await supabase
    .from("deliverables")
    .select("status")
    .eq("id", request.source_deliverable_id)
    .maybeSingle();

  if (source?.status !== "needs_changes") {
    return NextResponse.json(
      { error: "This deliverable is no longer awaiting a revision." },
      { status: 409 },
    );
  }

  const result = await startRevisionExecution(revisionRequestId);

  if (isFailure(result)) {
    return NextResponse.json(
      { error: result.error, executionId: result.executionId },
      { status: result.status },
    );
  }

  return NextResponse.json(result, { status: 201 });
}
