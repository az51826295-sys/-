import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { completeCycle } from "@/lib/operations/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await completeCycle(id);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
