import { NextResponse } from "next/server";
import {
  getOwnedProject,
  getProjectDeliverable,
  listWorkItems,
} from "@/lib/projects/service";
import {
  projectFailureCopy,
  projectStatusLabel,
  workItemStatusLabel,
  type ProjectFailureCode,
} from "@/lib/projects/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const owned = await getOwnedProject(id);
  if (!owned) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const { project } = owned;
  const workItems = await listWorkItems(id);
  const deliverable = await getProjectDeliverable(id);

  return NextResponse.json({
    project: {
      id: project.id,
      title: project.title,
      goal: project.goal,
      expectedOutcome: project.expected_outcome,
      status: project.status,
      statusLabel: projectStatusLabel[project.status],
      progress: project.progress_percentage,
      // The code drives the message; the stored detail stays on the server.
      failure: project.failure_code
        ? (projectFailureCopy[project.failure_code as ProjectFailureCode] ??
          "Something went wrong running this project.")
        : null,
      startedAt: project.started_at,
      completedAt: project.completed_at,
    },
    workItems: workItems.map((item) => ({
      ...item,
      statusLabel: workItemStatusLabel[item.status],
    })),
    deliverable: deliverable
      ? {
          id: deliverable.id,
          title: deliverable.title,
          status: deliverable.status,
          version: deliverable.version,
        }
      : null,
  });
}
