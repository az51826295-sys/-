import { NextResponse } from "next/server";
import { getOwnedRecurring, listOccurrences } from "@/lib/recurring/access";
import { occurrenceStatusLabel } from "@/lib/recurring/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const owned = await getOwnedRecurring(id);
  if (!owned) {
    return NextResponse.json({ error: "Recurring assignment not found." }, { status: 404 });
  }

  const occurrences = await listOccurrences(id, 50);

  return NextResponse.json({
    occurrences: occurrences.map((occurrence) => ({
      id: occurrence.id,
      scheduledFor: occurrence.scheduled_for,
      status: occurrence.status,
      statusLabel: occurrenceStatusLabel[occurrence.status],
      assignmentId: occurrence.assignment_id,
      skipReason: occurrence.skip_reason,
      failureCode: occurrence.failure_code,
      startedAt: occurrence.started_at,
      completedAt: occurrence.completed_at,
    })),
  });
}
