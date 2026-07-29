import { NextResponse } from "next/server";
import { loadCycleDetail } from "@/lib/operations/service";
import { cycleStatusLabel } from "@/lib/operations/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const detail = await loadCycleDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Operation not found." }, { status: 404 });
  }

  return NextResponse.json({
    operation: {
      id: detail.cycle.id,
      name: detail.cycle.name,
      objective: detail.cycle.objective,
      status: detail.cycle.status,
      statusLabel: cycleStatusLabel[detail.cycle.status],
      startedAt: detail.cycle.started_at,
      endedAt: detail.cycle.ended_at,
    },
    planSummary: detail.planSummary,
    phases: detail.phases,
    projects: detail.projects,
    review: detail.review,
  });
}
