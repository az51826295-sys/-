import { NextResponse } from "next/server";
import { publishPlaybook } from "@/lib/playbooks/service";

/** Putting a method into use. The only path to "active", because it has to take
 *  a version with it — work already under way keeps the one it started under. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const result = await publishPlaybook(
    id,
    body?.changeSummary ? String(body.changeSummary) : "",
  );

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
