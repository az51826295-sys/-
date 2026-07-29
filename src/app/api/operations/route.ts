import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isFailure } from "@/lib/assignments/service";
import { createCycle, prepareOperatingPlan, type CycleRow } from "@/lib/operations/service";
import { cycleStatusLabel, type CycleStatus } from "@/lib/operations/types";

// One planning call.
export const maxDuration = 300;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data } = await supabase
    .from("operating_cycles")
    .select("*")
    .order("created_at", { ascending: false });

  return NextResponse.json({
    operations: ((data ?? []) as CycleRow[]).map((cycle) => ({
      id: cycle.id,
      name: cycle.name,
      objective: cycle.objective,
      status: cycle.status,
      statusLabel: cycleStatusLabel[cycle.status as CycleStatus],
      startedAt: cycle.started_at,
      endedAt: cycle.ended_at,
    })),
  });
}

/** Creates the period and works out how it breaks down. Planning is part of
 *  this because a period with no plan has nothing for the manager to read. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const created = await createCycle({
    name: String(body.name ?? ""),
    objective: String(body.objective ?? ""),
  });

  if (isFailure(created)) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }

  const planned = await prepareOperatingPlan(created.cycleId);

  if (isFailure(planned)) {
    // The period exists either way, so it is returned rather than lost — the
    // failure and its retry belong on the operation's own page.
    return NextResponse.json(
      { cycleId: created.cycleId, warning: planned.error },
      { status: 201 },
    );
  }

  return NextResponse.json({ cycleId: created.cycleId }, { status: 201 });
}
