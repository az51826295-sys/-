import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { retryOccurrence } from "@/lib/recurring/processor";
import { startScheduledExecution } from "@/lib/recurring/execution";
import type { OccurrenceRow } from "@/lib/recurring/types";

export const maxDuration = 300;

/**
 * Runs a failed turn again, reusing the same occurrence rather than creating a
 * new one — the manager is retrying Monday's work, not scheduling an extra one.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Ownership is checked through the caller's own client, where row level
  // security applies. The retry itself then runs with the scheduler's client,
  // because it does the same work the scheduler does.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Occurrence not found." }, { status: 404 });
  }

  const { data: occurrence } = await supabase
    .from("recurring_assignment_occurrences")
    .select("*")
    .eq("id", id)
    .maybeSingle<OccurrenceRow>();

  if (!occurrence) {
    return NextResponse.json({ error: "Occurrence not found." }, { status: 404 });
  }

  if (occurrence.status !== "failed") {
    return NextResponse.json(
      { error: "Only a failed scheduled assignment can be tried again." },
      { status: 409 },
    );
  }

  if (occurrence.assignment_id) {
    return NextResponse.json(
      { error: "This scheduled assignment was already created." },
      { status: 409 },
    );
  }

  const db = createServiceClient();
  const result = await retryOccurrence(db, id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (result.assignmentId) {
    await startScheduledExecution(db, result.assignmentId);
  }

  return NextResponse.json({ status: result.status });
}
