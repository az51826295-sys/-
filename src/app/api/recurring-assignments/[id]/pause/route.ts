import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { getOwnedRecurring } from "@/lib/recurring/access";
import { pauseRecurringAssignment } from "@/lib/recurring/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Ownership before state, so another company's schedule is a 404 rather than
  // a 409 that would confirm it exists.
  const owned = await getOwnedRecurring(id);
  if (!owned) {
    return NextResponse.json({ error: "Recurring assignment not found." }, { status: 404 });
  }

  const result = await pauseRecurringAssignment(id);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
