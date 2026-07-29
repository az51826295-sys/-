import { notFound } from "next/navigation";
import Link from "next/link";
import { getOwnedInitiative } from "@/lib/initiatives/service";
import { NavBar } from "@/components/NavBar";
import { formatAssignedDate } from "@/lib/assignments/labels";
import {
  confidenceClass,
  confidenceLabel,
  initiativeStatusLabel,
  observationKindLabel,
  priorityLabel,
  type ObservationKind,
} from "@/lib/initiatives/types";
import { InitiativeActions } from "./InitiativeActions";

export default async function InitiativePage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;

  const owned = await getOwnedInitiative(initiativeId);
  if (!owned) notFound();

  const { initiative, employee, companyEmployeeId } = owned;
  const evidence = initiative.evidence_json ?? [];
  const kind = evidence[0]?.kind as ObservationKind | undefined;

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-zinc-700">{employee.name}</p>
            <p className="text-sm text-zinc-500">{employee.role}</p>
            <h1 className="mt-3 text-2xl font-semibold text-zinc-900">
              {initiative.title}
            </h1>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${confidenceClass[initiative.confidence]}`}
          >
            {confidenceLabel[initiative.confidence]}
          </span>
        </div>

        {initiative.status !== "new" && (
          <div className="mt-6 rounded-lg bg-zinc-100 px-5 py-4">
            <p className="text-sm font-medium text-zinc-900">
              {initiativeStatusLabel[initiative.status]}
            </p>
            {initiative.assignment_id && (
              <Link
                href={`/dashboard/assignments/${initiative.assignment_id}`}
                className="mt-1 inline-block text-sm text-zinc-700 underline"
              >
                View the assignment
              </Link>
            )}
          </div>
        )}

        <section className="mt-6 rounded-lg border border-zinc-200 p-6">
          <h2 className="text-sm font-medium text-zinc-900">What {employee.name} noticed</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-zinc-700">
            {initiative.summary}
          </p>
        </section>

        <section className="mt-6 rounded-lg border border-zinc-900 p-6">
          <h2 className="text-sm font-medium text-zinc-900">
            What {employee.name} recommends
          </h2>
          <p className="mt-2 text-sm text-zinc-900">{initiative.recommendation}</p>

          <dl className="mt-4 flex flex-wrap gap-6 border-t border-zinc-100 pt-4">
            <div>
              <dt className="text-xs text-zinc-500">Priority</dt>
              <dd className="mt-0.5 text-sm text-zinc-900">
                {priorityLabel[initiative.priority]}
              </dd>
            </div>
            {kind && (
              <div>
                <dt className="text-xs text-zinc-500">Kind</dt>
                <dd className="mt-0.5 text-sm text-zinc-900">
                  {observationKindLabel[kind]}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-zinc-500">Noticed</dt>
              <dd className="mt-0.5 text-sm text-zinc-900">
                {formatAssignedDate(initiative.created_at)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 p-6">
          <h2 className="text-sm font-medium text-zinc-900">Why it matters</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-zinc-700">
            {initiative.reasoning}
          </p>
        </section>

        {/* Every URL here was fetched by the employee; none was written by the
            model. That is what makes this section worth reading. */}
        <section className="mt-6 rounded-lg border border-zinc-200 p-6">
          <h2 className="text-sm font-medium text-zinc-900">Evidence</h2>
          {evidence.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No sources were recorded.</p>
          ) : (
            <ol className="mt-3 space-y-4">
              {evidence.map((entry, index) => (
                <li key={entry.observationId} className="flex gap-3 text-sm">
                  <span className="shrink-0 text-zinc-400">[{index + 1}]</span>
                  <div>
                    <p className="font-medium text-zinc-900">{entry.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {entry.domain}
                      {entry.publishedAt &&
                        ` · published ${formatAssignedDate(entry.publishedAt)}`}
                    </p>
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="mt-1 inline-block text-xs text-zinc-700 underline"
                    >
                      Open source
                    </a>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {initiative.status === "new" && (
          <InitiativeActions
            initiativeId={initiative.id}
            employeeName={employee.name}
            snapshot={initiative.assignment_snapshot}
          />
        )}

        <div className="mt-6 flex justify-between">
          <Link href="/dashboard/initiatives" className="text-sm text-zinc-600 underline">
            All recommendations
          </Link>
          <Link
            href={`/dashboard/employees/${companyEmployeeId}`}
            className="text-sm text-zinc-600 underline"
          >
            Back to {employee.name}
          </Link>
        </div>
      </main>
    </div>
  );
}
