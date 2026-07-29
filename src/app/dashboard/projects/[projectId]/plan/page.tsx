import { notFound, redirect } from "next/navigation";
import { getOwnedProject } from "@/lib/projects/service";
import { NavBar } from "@/components/NavBar";
import { StartProject } from "./StartProject";

interface PlanShape {
  projectSummary?: string;
  successCriteria?: string[];
  workItems?: {
    clientId: string;
    title: string;
    objective: string;
    dependencyClientIds: string[];
    requiredForProjectCompletion: boolean;
  }[];
  resolvedWorkItems?: {
    clientId: string;
    employeeName: string;
    employeeRole: string;
    assigneeRationale?: string;
    followedRecommendation?: boolean;
    sequenceOrder: number;
  }[];
  finalDeliverable?: { title?: string; sections?: string[] };
  risks?: string[];
  assumptions?: string[];
}

export default async function ProjectPlanPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const owned = await getOwnedProject(projectId);
  if (!owned) notFound();

  const { project } = owned;

  // The plan is only a decision while it is still a decision. Once the work has
  // started, this page has nothing to offer.
  if (project.status !== "plan_ready") {
    redirect(`/dashboard/projects/${projectId}`);
  }

  const plan = (project.plan_json ?? {}) as PlanShape;
  const staffing = new Map(
    (plan.resolvedWorkItems ?? []).map((item) => [item.clientId, item]),
  );
  const titles = new Map(
    (plan.workItems ?? []).map((item) => [item.clientId, item.title]),
  );

  const ordered = [...(plan.workItems ?? [])].sort(
    (a, b) =>
      (staffing.get(a.clientId)?.sequenceOrder ?? 0) -
      (staffing.get(b.clientId)?.sequenceOrder ?? 0),
  );

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <p className="text-sm text-zinc-500">Review Project Plan</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{project.title}</h1>

        <section className="mt-6 rounded-lg border border-zinc-200 p-6">
          <p className="text-xs text-zinc-500">Goal</p>
          <p className="mt-1 text-sm text-zinc-700">{project.goal}</p>
          {plan.projectSummary && (
            <p className="mt-4 border-t border-zinc-100 pt-4 text-sm text-zinc-700">
              {plan.projectSummary}
            </p>
          )}
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-medium text-zinc-900">Planned Work</h2>

          <ol className="mt-3 space-y-3">
            {ordered.map((item, index) => {
              const who = staffing.get(item.clientId);
              const waitsFor = item.dependencyClientIds
                .map((id) => titles.get(id))
                .filter(Boolean);

              return (
                <li
                  key={item.clientId}
                  className="rounded-lg border border-zinc-200 px-5 py-4"
                >
                  <p className="text-sm font-medium text-zinc-900">
                    {index + 1}. {item.title}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {who?.employeeName ?? "An employee"}
                    {who?.employeeRole ? ` · ${who.employeeRole}` : ""}
                  </p>
                  <p className="mt-2 text-sm text-zinc-700">{item.objective}</p>

                  {/*
                    Why this person.

                    The product asks the manager to accept that somebody else
                    chose who does their work. That is only reasonable if they
                    can see the reason — otherwise their sole way to disagree
                    is to throw out the whole plan, which is the same as having
                    no say at all.
                  */}
                  {who?.assigneeRationale && (
                    <p className="mt-3 border-l-2 border-zinc-200 pl-3 text-sm text-zinc-600">
                      <span className="text-zinc-400">Why {who.employeeName}: </span>
                      {who.assigneeRationale}
                      {who.followedRecommendation === false && (
                        <span className="mt-1 block text-xs text-amber-700">
                          That reasoning was written for a different colleague.
                          The {who.employeeRole ? "department" : "team"} that
                          owns this work put it on {who.employeeName} instead.
                        </span>
                      )}
                    </p>
                  )}

                  <p className="mt-3 text-xs text-zinc-500">
                    {/* Said in terms of people and work, never as a graph. */}
                    {waitsFor.length > 0
                      ? `Starts after ${waitsFor.join(" and ")} is complete`
                      : "Starts immediately"}
                    {item.requiredForProjectCompletion ? "" : " · optional"}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>

        {plan.finalDeliverable?.title && (
          <section className="mt-6 rounded-lg border border-zinc-200 p-6">
            <h2 className="text-sm font-medium text-zinc-900">Final Result</h2>
            <p className="mt-1 text-sm text-zinc-700">{plan.finalDeliverable.title}</p>
            {plan.finalDeliverable.sections &&
              plan.finalDeliverable.sections.length > 0 && (
                <>
                  <p className="mt-3 text-xs text-zinc-500">Includes</p>
                  <ul className="mt-1 space-y-0.5">
                    {plan.finalDeliverable.sections.map((section) => (
                      <li key={section} className="text-sm text-zinc-600">
                        • {section}
                      </li>
                    ))}
                  </ul>
                </>
              )}
          </section>
        )}

        {plan.risks && plan.risks.length > 0 && (
          <section className="mt-6 rounded-lg bg-amber-50 px-5 py-4">
            <p className="text-sm font-medium text-amber-900">Worth knowing</p>
            <ul className="mt-2 space-y-1">
              {plan.risks.map((risk) => (
                <li key={risk} className="text-sm text-amber-800">
                  • {risk}
                </li>
              ))}
            </ul>
          </section>
        )}

        <StartProject projectId={project.id} />
      </main>
    </div>
  );
}
