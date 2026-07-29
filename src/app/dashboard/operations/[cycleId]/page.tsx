import { notFound } from "next/navigation";
import Link from "next/link";
import { loadCycleDetail } from "@/lib/operations/service";
import { NavBar } from "@/components/NavBar";
import { formatAssignedDate } from "@/lib/assignments/labels";
import {
  cycleStatusClass,
  cycleStatusLabel,
} from "@/lib/operations/types";
import {
  projectStatusLabel,
  type ProjectStatus,
} from "@/lib/projects/types";
import { OperationActions, OperationControls } from "../OperationActions";

export default async function OperationPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const { cycleId } = await params;

  // Another company's cycle id simply isn't visible, so this is a 404 rather
  // than a distinction between absent and not yours.
  const detail = await loadCycleDetail(cycleId);
  if (!detail) notFound();

  const { cycle, planSummary, phases, projects, review } = detail;
  const isOpen = ["planning", "active", "review"].includes(cycle.status);

  // Only a review nobody has acted on is still asking a question.
  const awaitingDecision = review?.status === "ready";
  const yoursToDo = awaitingDecision
    ? []
    : (review?.recommendations ?? []).filter((item) => item.needsManagerAction);

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{cycle.name}</h1>
            <p className="mt-2 text-sm text-zinc-600">{cycle.objective}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${cycleStatusClass[cycle.status]}`}
          >
            {cycleStatusLabel[cycle.status]}
          </span>
        </div>

        {planSummary && (
          <section className="mt-6 rounded-lg border border-zinc-200 p-6">
            <h2 className="text-sm font-medium text-zinc-900">How this breaks down</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-zinc-700">
              {planSummary}
            </p>
          </section>
        )}

        {phases.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-medium text-zinc-900">Phases</h2>
            <ol className="mt-3 space-y-3">
              {phases.map((phase, index) => (
                <li
                  key={`${phase.name}-${index}`}
                  className="rounded-lg border border-zinc-200 px-5 py-4"
                >
                  <p className="text-sm font-medium text-zinc-900">
                    {index + 1}. {phase.name}
                  </p>
                  <p className="mt-1 text-sm text-zinc-700">{phase.intent}</p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {phase.departments.length > 0
                      ? phase.departments.join(", ")
                      : "No department named"}
                    {phase.startsAfter?.trim()
                      ? ` · after ${phase.startsAfter}`
                      : " · can start now"}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* The recommendation sits above the project list: it is the only thing
            on this page asking the manager for a decision. */}
        {review && isOpen && (awaitingDecision || yoursToDo.length > 0) && (
          <section className="mt-8">
            <h2 className="text-sm font-medium text-zinc-900">
              {awaitingDecision ? "Where we are" : "From the last review"}
            </h2>
            {awaitingDecision && (
              <p className="mt-2 text-sm text-zinc-700">{review.summary}</p>
            )}

            {awaitingDecision && review.blockers.length > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 px-5 py-4">
                <p className="text-sm font-medium text-amber-900">Holding things up</p>
                <ul className="mt-2 space-y-1">
                  {review.blockers.map((blocker, index) => (
                    <li key={`${blocker}-${index}`} className="text-sm text-amber-800">
                      • {blocker}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {awaitingDecision && review.objectiveLooksMet && (
              <p className="mt-3 rounded-lg bg-green-50 px-5 py-4 text-sm text-green-800">
                This looks like what the period was for. Closing it is your call.
              </p>
            )}

            {awaitingDecision ? (
              review.recommendations.length > 0 ? (
                <>
                  <h3 className="mt-6 text-sm font-medium text-zinc-900">
                    What I&apos;d do next
                  </h3>
                  <OperationActions
                    cycleId={cycle.id}
                    recommendations={review.recommendations}
                  />
                </>
              ) : (
                <p className="mt-4 text-sm text-zinc-500">
                  Nothing to start right now — the work in flight should finish
                  first.
                </p>
              )
            ) : (
              /* The review has been acted on, but anything it asked the manager
                 to do themselves is still theirs to do. Starting a project
                 shouldn't quietly take it off their desk. */
              yoursToDo.length > 0 && (
                <>
                  <h3 className="mt-6 text-sm font-medium text-zinc-900">
                    Still yours to do
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {yoursToDo.map((item, index) => (
                      <li
                        key={`${item.title}-${index}`}
                        className="rounded-lg border border-zinc-200 px-5 py-4"
                      >
                        <p className="text-sm font-medium text-zinc-900">
                          {item.title}
                        </p>
                        <p className="mt-1 text-sm text-zinc-700">
                          {item.reasoning}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-zinc-400">
                    Nobody here can do these for you. The next review will tell
                    you where they stand.
                  </p>
                </>
              )
            )}
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-sm font-medium text-zinc-900">Projects</h2>
          {projects.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">
              Nothing yet. A review will suggest where to start.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/dashboard/projects/${project.id}`}
                    className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-zinc-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        {project.title}
                      </p>
                      {project.status === "working" && (
                        <p className="mt-0.5 text-xs text-zinc-400">
                          {project.progress}% complete
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {projectStatusLabel[project.status as ProjectStatus] ??
                        project.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {isOpen && (
          <OperationControls
            cycleId={cycle.id}
            canReview={cycle.status !== "planning"}
            canComplete
          />
        )}

        <div className="mt-8 flex justify-between">
          <Link href="/dashboard/operations" className="text-sm text-zinc-600 underline">
            All operations
          </Link>
          {cycle.ended_at && (
            <p className="text-sm text-zinc-500">
              Closed {formatAssignedDate(cycle.ended_at)}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
