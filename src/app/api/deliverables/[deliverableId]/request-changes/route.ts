import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { getOwnedDeliverable } from "@/lib/deliverables/access";
import { requestChangesAndReviseDeliverable } from "@/lib/revisions/service";

// Requesting changes now also runs the revision, which takes minutes.
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ deliverableId: string }> },
) {
  const { deliverableId } = await params;

  const owned = await getOwnedDeliverable(deliverableId);
  if (!owned) {
    return NextResponse.json({ error: "Deliverable not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);

  const result = await requestChangesAndReviseDeliverable(
    deliverableId,
    String(body?.feedback ?? ""),
  );

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
