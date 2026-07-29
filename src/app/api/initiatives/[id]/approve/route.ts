import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { approveInitiative } from "@/lib/initiatives/service";
import { startExecutionForAssignment } from "@/lib/initiatives/execution";

// Approving hands the work straight to the employee, and a research run takes
// minutes.
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await approveInitiative(id);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Starting the work is separate from approving it: if this fails the
  // assignment still exists and can be retried from its own page, rather than
  // the approval being lost.
  await startExecutionForAssignment(result.assignmentId);

  return NextResponse.json(result, { status: 201 });
}
