import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { retryLearning } from "@/lib/memory/service";

export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ learningSessionId: string }> },
) {
  const { learningSessionId } = await params;

  const result = await retryLearning(learningSessionId);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
