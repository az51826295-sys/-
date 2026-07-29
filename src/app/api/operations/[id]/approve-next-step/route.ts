import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { approveNextStep } from "@/lib/operations/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const index = Number(body?.recommendationIndex ?? 0);

  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Creates a project in draft. Day 12's plan-then-approve still applies on
  // top, so approving a recommendation never starts work by itself.
  const result = await approveNextStep(id, index);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
