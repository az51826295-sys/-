import { NextResponse } from "next/server";
import { decideCandidate } from "@/lib/knowledge/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const decision = String(body?.decision ?? "");

  if (decision !== "rejected" && decision !== "needs_revision") {
    return NextResponse.json(
      { error: "That isn't a decision I know." },
      { status: 400 },
    );
  }

  const result = await decideCandidate(id, decision, String(body?.note ?? ""));

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
