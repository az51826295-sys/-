import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { getOwnedInitiative, dismissInitiative } from "@/lib/initiatives/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Ownership before state, so another company's proposal is a 404 rather than
  // a 409 that would confirm it exists.
  const owned = await getOwnedInitiative(id);
  if (!owned) {
    return NextResponse.json({ error: "Recommendation not found." }, { status: 404 });
  }

  const result = await dismissInitiative(id);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
