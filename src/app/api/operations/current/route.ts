import { NextResponse } from "next/server";
import { getCurrentCycle, loadCycleDetail } from "@/lib/operations/service";
import { cycleStatusLabel } from "@/lib/operations/types";

export async function GET() {
  const cycle = await getCurrentCycle();

  // No open period is a normal state, not an error — a company between
  // operations still has a working dashboard.
  if (!cycle) return NextResponse.json({ operation: null });

  const detail = await loadCycleDetail(cycle.id);
  if (!detail) return NextResponse.json({ operation: null });

  return NextResponse.json({
    operation: {
      id: cycle.id,
      name: cycle.name,
      objective: cycle.objective,
      status: cycle.status,
      statusLabel: cycleStatusLabel[cycle.status],
      projects: detail.projects.length,
      activeProjects: detail.projects.filter((p) =>
        ["working", "preparing_final_deliverable"].includes(p.status),
      ).length,
      nextRecommendation: detail.review?.recommendations[0]?.title ?? null,
    },
  });
}
