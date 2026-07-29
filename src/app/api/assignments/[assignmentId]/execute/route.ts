import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { startExecution } from "@/lib/execution/service";

// A real run does several model calls and many fetches.
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const { assignmentId } = await params;

  const result = await startExecution(assignmentId);

  if (isFailure(result)) {
    return NextResponse.json(
      { error: result.error, executionId: result.executionId },
      { status: result.status },
    );
  }

  return NextResponse.json(result, { status: 201 });
}
