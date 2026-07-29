import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { getOwnedDeliverable } from "@/lib/deliverables/access";
import { approveDeliverable } from "@/lib/deliverables/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ deliverableId: string }> },
) {
  const { deliverableId } = await params;

  // Ownership first, so another company's id is a 404 rather than a 409.
  const owned = await getOwnedDeliverable(deliverableId);
  if (!owned) {
    return NextResponse.json({ error: "Deliverable not found." }, { status: 404 });
  }

  // Approving a superseded version would complete the assignment against work
  // the manager has already asked to be redone.
  const { data: latest } = await owned.supabase
    .from("deliverables")
    .select("id, version")
    .eq("assignment_id", owned.deliverable.assignment_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest && (latest.version as number) > owned.deliverable.version) {
    return NextResponse.json(
      {
        error: "This is not the latest version of the deliverable.",
        latestDeliverableId: latest.id,
      },
      { status: 409 },
    );
  }

  const result = await approveDeliverable(deliverableId);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
