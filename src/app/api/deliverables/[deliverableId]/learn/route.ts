import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { getOwnedDeliverable } from "@/lib/deliverables/access";
import {
  getLearningSessionForDeliverable,
  startLearning,
} from "@/lib/memory/service";

// One model call over the whole deliverable.
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ deliverableId: string }> },
) {
  const { deliverableId } = await params;

  const result = await startLearning(deliverableId);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deliverableId: string }> },
) {
  const { deliverableId } = await params;

  // Ownership is checked against the deliverable, so an id from another company
  // never reveals whether a learning session exists for it.
  const owned = await getOwnedDeliverable(deliverableId);
  if (!owned) {
    return NextResponse.json({ error: "Deliverable not found." }, { status: 404 });
  }

  const session = await getLearningSessionForDeliverable(deliverableId);

  if (!session) {
    return NextResponse.json({ session: null });
  }

  return NextResponse.json({
    session: {
      id: session.id,
      status: session.status,
      candidateCount: session.candidate_count,
      acceptedCount: session.accepted_count,
      rejectedCount: session.rejected_count,
      // The error code drives the message the manager sees; the stored message
      // is for debugging and stays on the server.
      errorCode: session.error_code,
      completedAt: session.completed_at,
      failedAt: session.failed_at,
    },
  });
}
