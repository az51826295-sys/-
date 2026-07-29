import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { startProject } from "@/lib/projects/service";
import { createServiceClient } from "@/lib/supabase/service";
import { advanceProject } from "@/lib/projects/coordinator";

// Several employees' work end to end, then the merge.
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await startProject(id);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Run with the service client: the coordinator writes assignments and
  // executions on several employees' behalf. Ownership was established above.
  await advanceProject(createServiceClient(), id);

  return NextResponse.json(result);
}
