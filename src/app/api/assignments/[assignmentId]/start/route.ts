import { NextResponse } from "next/server";
import { getOwnedAssignment } from "@/lib/assignments/access";
import { isFailure, startAssignment } from "@/lib/assignments/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const { assignmentId } = await params;

  // Ownership first: never let an unowned id reach the state machine.
  const owned = await getOwnedAssignment(assignmentId);
  if (!owned) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }

  const result = await startAssignment(assignmentId);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
