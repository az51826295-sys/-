import { NextResponse } from "next/server";
import { approveCandidate } from "@/lib/knowledge/service";

/** The moment one employee's afternoon becomes everybody's standing
 *  instruction. A manager's click, never a consequence of good work. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await approveCandidate(id);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
