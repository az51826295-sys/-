import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { approveProject } from "@/lib/projects/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await approveProject(id);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
