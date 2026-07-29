import { NextResponse } from "next/server";
import { decideEvolutionPlan } from "@/lib/evolution/service";

/** Records the decision. Creates no department and hires nobody. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const decision = String(body?.decision ?? "");

  if (decision !== "approved" && decision !== "cancelled") {
    return NextResponse.json(
      { error: "That isn't a decision I know." },
      { status: 400 },
    );
  }

  const result = await decideEvolutionPlan(id, decision);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
