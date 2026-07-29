import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { getOwnedRecurring, listOccurrences } from "@/lib/recurring/access";
import { updateRecurringAssignment, scheduleOf } from "@/lib/recurring/service";
import { describeSchedule } from "@/lib/schedule/recurrence";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const owned = await getOwnedRecurring(id);
  if (!owned) {
    return NextResponse.json({ error: "Recurring assignment not found." }, { status: 404 });
  }

  const { recurring, employee } = owned;
  const occurrences = await listOccurrences(id, 20);

  return NextResponse.json({
    recurringAssignment: {
      id: recurring.id,
      title: recurring.title,
      description: recurring.description,
      expectedOutcome: recurring.expected_outcome,
      priority: recurring.priority,
      status: recurring.status,
      conflictPolicy: recurring.conflict_policy,
      scheduleSummary: describeSchedule(scheduleOf(recurring)),
      timezone: recurring.timezone,
      nextRunAt: recurring.next_run_at,
      lastRunAt: recurring.last_run_at,
      pauseReason: recurring.pause_reason,
      consecutiveFailures: recurring.consecutive_failure_count,
    },
    employee,
    occurrences: occurrences.map((occurrence) => ({
      id: occurrence.id,
      scheduledFor: occurrence.scheduled_for,
      status: occurrence.status,
      assignmentId: occurrence.assignment_id,
      skipReason: occurrence.skip_reason,
      // The code drives the message the manager sees; the stored detail stays
      // on the server.
      failureCode: occurrence.failure_code,
    })),
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Ownership first, so another company's id is a 404 rather than a 400.
  const owned = await getOwnedRecurring(id);
  if (!owned) {
    return NextResponse.json({ error: "Recurring assignment not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await updateRecurringAssignment(id, {
    title: String(body.title ?? ""),
    description: String(body.description ?? ""),
    expectedOutcome: body.expectedOutcome ? String(body.expectedOutcome) : undefined,
    priority: body.priority ?? "normal",
    roleInput: body.roleInput,
    schedule: body.schedule,
    conflictPolicy: body.conflictPolicy,
  });

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
