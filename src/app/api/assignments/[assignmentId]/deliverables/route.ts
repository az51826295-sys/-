import { NextResponse } from "next/server";
import { getOwnedAssignment } from "@/lib/assignments/access";
import type { Deliverable } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const { assignmentId } = await params;
  const owned = await getOwnedAssignment(assignmentId);

  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { supabase } = owned;

  const { data: rows } = await supabase
    .from("deliverables")
    .select("*")
    .eq("assignment_id", assignmentId)
    .order("version", { ascending: false });

  const deliverables = (rows ?? []) as Deliverable[];
  const latestVersion = deliverables[0]?.version ?? 0;

  const { data: reviewRows } = await supabase
    .from("deliverable_reviews")
    .select("deliverable_id, decision, feedback, created_at")
    .in(
      "deliverable_id",
      deliverables.map((d) => d.id),
    );

  const reviewByDeliverable = new Map(
    (reviewRows ?? []).map((review) => [review.deliverable_id as string, review]),
  );

  return NextResponse.json({
    versions: deliverables.map((deliverable) => ({
      id: deliverable.id,
      version: deliverable.version,
      title: deliverable.title,
      status: deliverable.status,
      submittedAt: deliverable.submitted_at,
      sourceCount: deliverable.source_count,
      isLatest: deliverable.version === latestVersion,
      review: reviewByDeliverable.get(deliverable.id) ?? null,
    })),
  });
}
