import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { cancelProject } from "@/lib/projects/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await cancelProject(id);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
