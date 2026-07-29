import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { prepareePlan } from "@/lib/projects/service";

// One planning call plus a possible correction.
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Ownership is checked inside the service against the caller's own client,
  // where row level security applies, so another company's id is a 404.
  const result = await prepareePlan(id);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
