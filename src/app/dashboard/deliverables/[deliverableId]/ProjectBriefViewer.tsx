import Link from "next/link";
import type { ProjectBrief } from "@/lib/projects/types";

export interface ContributionLink {
  workItemId: string;
  employeeName: string;
  deliverableId: string | null;
}

/**
 * The project's result, as the manager reads it.
 *
 * Structured rather than a wall of markdown because the manager is deciding
 * whether to act on it: the recommendations and what they rest on are what
 * matter, and each employee's own work stays one click away rather than being
 * inlined.
 */
export function ProjectBriefViewer({
  brief,
  contributions,
}: {
  brief: ProjectBrief;
  contributions: ContributionLink[];
}) {
  const linkFor = new Map(
    contributions.map((contribution) => [
      contribution.employeeName,
      contribution.deliverableId,
    ]),
  );

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-lg border border-zinc-200 p-8">
        <p className="text-xs text-zinc-500">Executive Summary</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-800">
          {brief.executiveSummary}
        </p>
      </section>

      {brief.keyFindings.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-zinc-900">Key Findings</h2>
          <ul className="mt-3 space-y-3">
            {brief.keyFindings.map((finding, index) => (
              <li
                key={`${finding.title}-${index}`}
                className="rounded-lg border border-zinc-200 px-5 py-4"
              >
                <p className="text-sm font-medium text-zinc-900">{finding.title}</p>
                <p className="mt-1 text-sm text-zinc-700">{finding.summary}</p>
                {finding.citationIds.length > 0 && (
                  <p className="mt-2 text-xs text-zinc-400">
                    {finding.citationIds.length}{" "}
                    {finding.citationIds.length === 1 ? "source" : "sources"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief.recommendations.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-zinc-900">Recommendations</h2>
          <ul className="mt-3 space-y-3">
            {brief.recommendations.map((item, index) => (
              <li
                key={`${item.recommendation}-${index}`}
                className="rounded-lg border border-zinc-200 px-5 py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm font-medium text-zinc-900">
                    {item.recommendation}
                  </p>
                  {item.priority === "high" && (
                    <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                      High priority
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-zinc-600">
                  <span className="text-zinc-400">Why: </span>
                  {item.rationale}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief.actionPlan.length > 0 && (
        <section className="rounded-lg border border-zinc-200 p-6">
          <h2 className="text-sm font-medium text-zinc-900">Recommended Next Steps</h2>
          <ol className="mt-3 space-y-2">
            {brief.actionPlan.map((item, index) => (
              <li key={`${item.action}-${index}`} className="text-sm text-zinc-700">
                <span className="text-zinc-400">{index + 1}. </span>
                {item.action}
                {item.timing ? ` (${item.timing})` : ""}
              </li>
            ))}
          </ol>
        </section>
      )}

      {brief.employeeContributions.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-zinc-900">Employee Contributions</h2>
          <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {brief.employeeContributions.map((contribution, index) => {
              const deliverableId = linkFor.get(contribution.employeeName);
              return (
                <li
                  key={`${contribution.employeeName}-${index}`}
                  className="px-5 py-4"
                >
                  <p className="text-sm font-medium text-zinc-900">
                    {contribution.employeeName}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-500">{contribution.role}</p>
                  <p className="mt-2 text-sm text-zinc-700">{contribution.summary}</p>
                  {/* Each employee's own work stays one click away rather than
                      being inlined — the manager asked for one result. */}
                  {deliverableId && (
                    <Link
                      href={`/dashboard/deliverables/${deliverableId}`}
                      className="mt-2 inline-block text-xs text-zinc-600 underline"
                    >
                      View {contribution.employeeName}&apos;s work
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {brief.limitations.length > 0 && (
        <section className="rounded-lg bg-amber-50 px-5 py-4">
          <p className="text-sm font-medium text-amber-900">Limitations</p>
          <ul className="mt-2 space-y-1">
            {brief.limitations.map((item, index) => (
              <li key={`${item}-${index}`} className="text-sm text-amber-800">
                • {item}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
