import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isFailure } from "@/lib/assignments/service";
import { createProject, type ProjectRow } from "@/lib/projects/service";
import { projectStatusLabel, type ProjectStatus } from "@/lib/projects/types";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const status = request.nextUrl.searchParams.get("status");

  let query = supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data } = await query;

  return NextResponse.json({
    projects: ((data ?? []) as ProjectRow[]).map((project) => ({
      id: project.id,
      title: project.title,
      goal: project.goal,
      status: project.status,
      statusLabel: projectStatusLabel[project.status as ProjectStatus],
      progress: project.progress_percentage,
      startedAt: project.started_at,
      completedAt: project.completed_at,
    })),
  });
}

/** Creates the project only. Planning is a separate step so the manager sees
 *  the plan before anything is spent on carrying it out. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await createProject({
    title: String(body.title ?? ""),
    goal: String(body.goal ?? ""),
    expectedOutcome: body.expectedOutcome ? String(body.expectedOutcome) : undefined,
    priority: body.priority,
    initiativeId: body.initiativeId,
  });

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result, { status: 201 });
}
