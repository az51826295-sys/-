import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { getOwnedRecurring } from "@/lib/recurring/access";
import { resumeRecurringAssignment } from "@/lib/recurring/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const owned = await getOwnedRecurring(id);
  if (!owned) {
    return NextResponse.json({ error: "Recurring assignment not found." }, { status: 404 });
  }

  const result = await resumeRecurringAssignment(id);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
