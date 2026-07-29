import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { retryFinalDeliverable } from "@/lib/projects/service";
import { createServiceClient } from "@/lib/supabase/service";
import { advanceProject } from "@/lib/projects/coordinator";

export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await retryFinalDeliverable(id);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // The members' work is untouched — this only rebuilds what it adds up to.
  await advanceProject(createServiceClient(), id);

  return NextResponse.json(result);
}
