import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  getOwnedProject,
  getProjectDeliverable,
  listWorkItems,
} from "@/lib/projects/service";
import { NavBar } from "@/components/NavBar";
import { formatAssignedDate } from "@/lib/assignments/labels";
import { usageForProject } from "@/lib/costs/service";
import { CostSummary } from "@/components/CostSummary";
import { DeliverableBody } from "@/app/dashboard/deliverables/[deliverableId]/DeliverableBody";
import { ProjectReview } from "./ProjectReview";
import {
  projectFailureCopy,
  projectStatusClass,
  projectStatusLabel,
  workItemStatusLabel,
  type ProjectFailureCode,
  type WorkItemStatus,
} from "@/lib/projects/types";

const marker: Record<WorkItemStatus, string> = {
  completed: "✓",
  working: "●",
  awaiting_internal_review: "●",
  ready: "○",
  queued: "○",
  blocked: "○",
  planned: "○",
  failed: "✗",
  cancelled: "–",
  skipped: "–",
};

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const owned = await getOwnedProject(projectId);
  if (!owned) notFound();

  const { project } = owned;

  // A plan nobody has approved yet belongs on the review screen, not here.
  if (project.status === "plan_ready") {
    redirect(`/dashboard/projects/${projectId}/plan`);
  }

  const workItems = await listWorkItems(projectId);
  const deliverable = await getProjectDeliverable(projectId);
  const usage = await usageForProject(projectId);

  const titleById = new Map(workItems.map((item) => [item.id, item.title]));
  const done = workItems.filter((item) => item.status === "completed").length;

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{project.title}</h1>
            <p className="mt-2 text-sm text-zinc-600">{project.goal}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${projectStatusClass[project.status]}`}
          >
            {projectStatusLabel[project.status]}
          </span>
        </div>

        {["working", "preparing_final_deliverable"].includes(project.status) && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Progress</span>
              <span>{project.progress_percentage}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-zinc-900"
                style={{ width: `${project.progress_percentage}%` }}
              />
            </div>
          </div>
        )}

        {project.failure_code && (
          <div className="mt-6 rounded-lg bg-amber-50 px-5 py-4">
            <p className="text-sm text-amber-900">
              {projectFailureCopy[project.failure_code as ProjectFailureCode] ??
                "This project needs your attention."}
            </p>
          </div>
        )}

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-900">Who is doing what</h2>
            {workItems.length > 0 && (
              <p className="text-xs text-zinc-500">
                {done} of {workItems.length} done
              </p>
            )}
          </div>

          {workItems.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">
              The work hasn&apos;t been divided up yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {workItems.map((item) => {
                const waitsFor = item.dependsOn
                  .map((id) => titleById.get(id))
                  .filter(Boolean);

                return (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-4 px-5 py-4"
                  >
                    <div className="flex gap-3">
                      <span className="mt-0.5 text-sm text-zinc-400">
                        {marker[item.status]}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-zinc-900">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-sm text-zinc-500">
                          {item.employeeName}
                          {item.employeeRole ? ` · ${item.employeeRole}` : ""}
                        </p>

                        {/* "Why hasn't this started" is the first question a
                            half-finished project raises, so it is answered
                            before it is asked. */}
                        {item.status === "blocked" && waitsFor.length > 0 && (
                          <p className="mt-1 text-xs text-zinc-400">
                            Waiting for {waitsFor.join(" and ")}
                          </p>
                        )}
                        {item.status === "queued" && (
                          <p className="mt-1 text-xs text-zinc-400">
                            Waiting for {item.employeeName} to become available
                          </p>
                        )}

                        {item.deliverableId && (
                          <Link
                            href={`/dashboard/deliverables/${item.deliverableId}`}
                            className="mt-2 inline-block text-xs text-zinc-600 underline"
                          >
                            View {item.employeeName}&apos;s work
                          </Link>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {workItemStatusLabel[item.status]}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {deliverable && (
          <section className="mt-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  {deliverable.title}
                </h2>
                <p className="mt-0.5 text-sm text-zinc-500">
                  Prepared by your workforce · version {deliverable.version}
                </p>
              </div>
              {deliverable.status === "approved" && (
                <span className="shrink-0 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                  Approved
                </span>
              )}
            </div>

            <DeliverableBody
              deliverableType={deliverable.deliverable_type}
              contentMarkdown={deliverable.content_markdown}
              contentJson={deliverable.content_json}
              sources={[]}
              employeeName="your workforce"
              deliverableId={deliverable.id}
              contributions={workItems.map((item) => ({
                workItemId: item.id,
                employeeName: item.employeeName,
                deliverableId: item.deliverableId,
              }))}
            />

            {deliverable.status === "submitted" && (
              <ProjectReview projectId={project.id} />
            )}
          </section>
        )}

        {/* Every employee's calls plus planning and the merge — a project's
            spend is split across several runs and only adds up here. */}
        <CostSummary usage={usage} label="This project cost" />

        <div className="mt-8 flex justify-between">
          <Link href="/dashboard/projects" className="text-sm text-zinc-600 underline">
            All projects
          </Link>
          {project.completed_at && (
            <p className="text-sm text-zinc-500">
              Completed {formatAssignedDate(project.completed_at)}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
