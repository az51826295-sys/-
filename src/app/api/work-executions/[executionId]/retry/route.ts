import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { getOwnedExecution } from "@/lib/execution/access";
import { startExecution } from "@/lib/execution/service";

export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ executionId: string }> },
) {
  const { executionId } = await params;

  const owned = await getOwnedExecution(executionId);
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { supabase, execution } = owned;

  if (execution.status !== "failed") {
    return NextResponse.json(
      { error: "Only a failed attempt can be retried." },
      { status: 409 },
    );
  }

  // A deliverable already exists — there is nothing left to retry.
  const { data: deliverable } = await supabase
    .from("deliverables")
    .select("id")
    .eq("assignment_id", execution.assignment_id)
    .maybeSingle();

  if (deliverable) {
    return NextResponse.json(
      { error: "This assignment already has a deliverable.", deliverableId: deliverable.id },
      { status: 409 },
    );
  }

  // startExecution creates a new row with an incremented attempt_number; the
  // failed attempt is kept as history rather than overwritten.
  const result = await startExecution(execution.assignment_id);

  if (isFailure(result)) {
    return NextResponse.json(
      { error: result.error, executionId: result.executionId },
      { status: result.status },
    );
  }

  return NextResponse.json(result, { status: 201 });
}
