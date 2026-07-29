import { NextResponse } from "next/server";
import { decideRecommendation } from "@/lib/intelligence/service";

/** Approving records the decision and says where to go. It never carries the
 *  change out — every actual change happens on a screen the manager is on. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const decision = String(body?.decision ?? "");

  if (!["approved", "dismissed", "completed"].includes(decision)) {
    return NextResponse.json(
      { error: "That isn't a decision I know." },
      { status: 400 },
    );
  }

  const result = await decideRecommendation(
    id,
    decision as "approved" | "dismissed" | "completed",
  );

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
