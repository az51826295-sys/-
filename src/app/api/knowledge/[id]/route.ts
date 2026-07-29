import { NextResponse } from "next/server";
import { retireKnowledge } from "@/lib/knowledge/service";

/** Retired rather than deleted: work done under it should stay explicable. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await retireKnowledge(id);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
