import { notFound } from "next/navigation";
import Link from "next/link";
import { getOwnedDeliverable } from "@/lib/deliverables/access";
import { NavBar } from "@/components/NavBar";
import { DeliverableBody, rendersOwnSources } from "./DeliverableBody";
import {
  deliverableStatusClass,
  deliverableStatusLabel,
  formatAssignedDate,
} from "@/lib/assignments/labels";
import type { DeliverableStatus, ResearchSource } from "@/lib/types";
import { ReviewActions } from "./ReviewActions";
import { LearningPanel } from "./LearningPanel";
import { NextStepAction } from "./NextStepAction";
import {
  formatSize,
  loadDeliverableFiles,
  signedUrlsFor,
} from "@/lib/deliverables/files";
import { loadBlockingFindings, loadPolicyFindings } from "@/lib/policies/validation";
import { playbookUsedFor } from "@/lib/playbooks/resolve";
import { findingSeverityClass, findingSeverityLabel } from "@/lib/policies/types";

export default async function DeliverablePage({
  params,
}: {
  params: Promise<{ deliverableId: string }>;
}) {
  const { deliverableId } = await params;
  const owned = await getOwnedDeliverable(deliverableId);

  if (!owned) {
    notFound();
  }

  const { supabase, deliverable, assignment, employee, review } = owned;

  // Every version of this deliverable, so the reader can move between them and
  // an older one can be recognised as older.
  const { data: versionRows } = await supabase
    .from("deliverables")
    .select("id, version, status, submitted_at")
    .eq("assignment_id", deliverable.assignment_id)
    .order("version", { ascending: false });

  const versions = (versionRows ?? []) as {
    id: string;
    version: number;
    status: DeliverableStatus;
    submitted_at: string | null;
  }[];

  const latest = versions[0];
  const isLatest = !latest || latest.id === deliverable.id;
  const isPending = deliverable.status === "submitted" && isLatest;

  // Everything the work was measured against, and separately the subset that
  // still holds up an approval — a rule the manager has since turned off stays
  // on the record but stops standing in their way.
  const findings = await loadPolicyFindings(supabase, deliverable.id);

  /*
   * What the work says to do next, as work somebody can be given.
   *
   * Every report already ends with recommended next steps, and until now they
   * were prose at the bottom of a long document — read once and forgotten,
   * because acting on one meant retyping it into a form on another screen. The
   * loop this product is for is report → next work, and this is the missing
   * step in it.
   */
  const nextSteps = (
    (deliverable.content_json as { recommendedNextSteps?: unknown } | null)
      ?.recommendedNextSteps ?? []
  ) as string[];

  const { data: hireRows } = await supabase
    .from("company_employees")
    .select("id, work_status, employees(name, role)")
    .eq("company_id", deliverable.company_id);

  const colleagues = ((hireRows ?? []) as unknown as {
    id: string;
    work_status: string;
    employees: { name: string; role: string } | null;
  }[]).filter((row) => row.employees);
  // Signed fresh on every load rather than stored: a URL kept in the database
  // would outlive the permission that created it.
  const files = await loadDeliverableFiles(supabase, deliverable.id);
  const fileUrls = await signedUrlsFor(supabase, files);

  const blockingNow = await loadBlockingFindings(supabase, deliverable.id);

  // Which method produced this, at the version it was worked to. Publishing a
  // newer one since does not change the answer.
  const playbookUsed = await playbookUsedFor(supabase, deliverable.assignment_id);

  const revisionSummary = (deliverable.revision_summary_json ?? []) as {
    change: string;
    reason: string;
    section?: string;
  }[];

  // A revision shows the feedback that produced it; a version awaiting changes
  // shows the feedback just given.
  let managerFeedback: string | null =
    deliverable.status === "needs_changes" ? (review?.feedback ?? null) : null;

  if (!managerFeedback && deliverable.parent_deliverable_id) {
    const { data: parentReview } = await supabase
      .from("deliverable_reviews")
      .select("feedback")
      .eq("deliverable_id", deliverable.parent_deliverable_id)
      .eq("decision", "needs_changes")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    managerFeedback = (parentReview?.feedback as string | null) ?? null;
  }

  const { data: sourceRows } = await supabase
    .from("deliverable_sources")
    .select("citation_number, research_sources(title, url, domain, published_at, accessed_at, fetch_status)")
    .eq("deliverable_id", deliverable.id)
    .order("citation_number");

  // PostgREST types a to-one embed as an array; the FK guarantees exactly one.
  const sources = ((sourceRows ?? []) as unknown as {
    citation_number: number;
    research_sources: ResearchSource;
  }[]).filter((row) => row.research_sources);

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{deliverable.title}</h1>
            {versions.length > 1 && (
              <p className="mt-1 text-sm font-medium text-zinc-500">
                Version {deliverable.version}
              </p>
            )}
            <p className="mt-2 text-sm text-zinc-700">
              Submitted by {employee.name}
            </p>
            <p className="text-sm text-zinc-500">{employee.role}</p>
            {deliverable.submitted_at && (
              <p className="mt-1 text-xs text-zinc-400">
                Submitted {formatAssignedDate(deliverable.submitted_at)}
                {deliverable.source_count > 0 &&
                  ` · ${deliverable.source_count} ${deliverable.source_count === 1 ? "source" : "sources"} cited`}
              </p>
            )}
            {playbookUsed && (
              <p className="mt-1 text-xs text-zinc-400">
                Worked to{" "}
                {playbookUsed.playbookId ? (
                  <Link
                    href={`/dashboard/playbooks/${playbookUsed.playbookId}`}
                    className="underline"
                  >
                    {playbookUsed.name}
                  </Link>
                ) : (
                  playbookUsed.name
                )}{" "}
                v{playbookUsed.version}
              </p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${deliverableStatusClass[deliverable.status]}`}
          >
            {deliverableStatusLabel[deliverable.status]}
          </span>
        </div>

        <div className="mt-6 flex items-center justify-between rounded-lg border border-zinc-200 px-5 py-4">
          <div>
            <p className="text-xs text-zinc-500">Assignment</p>
            <p className="mt-0.5 text-sm font-medium text-zinc-900">{assignment.title}</p>
          </div>
          <Link
            href={`/dashboard/assignments/${assignment.id}`}
            className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            View Assignment
          </Link>
        </div>

        {!isLatest && latest && (
          <div className="mt-6 flex items-center justify-between rounded-lg bg-zinc-100 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-zinc-900">
                This is an earlier version of the deliverable.
              </p>
              <p className="mt-0.5 text-xs text-zinc-600">
                Version {latest.version} is the current one.
              </p>
            </div>
            <Link
              href={`/dashboard/deliverables/${latest.id}`}
              className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              View Latest Version
            </Link>
          </div>
        )}

        {deliverable.version > 1 && (
          <p className="mt-6 text-sm text-zinc-600">
            This deliverable was revised after manager feedback.
          </p>
        )}

        {revisionSummary.length > 0 && (
          <section className="mt-4 rounded-lg border border-zinc-200 p-6">
            <h2 className="text-sm font-medium text-zinc-900">What Changed</h2>
            <ul className="mt-3 space-y-2">
              {revisionSummary.slice(0, 5).map((item, index) => (
                <li key={index} className="text-sm text-zinc-700">
                  <span className="text-zinc-400">&bull;</span> {item.change}
                  {item.reason && (
                    <span className="block pl-4 text-xs text-zinc-500">{item.reason}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {deliverable.status === "approved" && (
          <div className="mt-6 rounded-lg bg-green-50 px-5 py-4">
            <p className="text-sm font-medium text-green-800">Approved by You</p>
            {deliverable.approved_at && (
              <p className="mt-0.5 text-xs text-green-700">
                Approved {formatAssignedDate(deliverable.approved_at)}
              </p>
            )}
          </div>
        )}

        {/* On a revision this is the feedback that prompted it; on a version
            awaiting changes it is the feedback just given. Either way it reads
            as a review record, not a chat message. */}
        {managerFeedback && (
          <div className="mt-6 rounded-lg bg-blue-50 px-5 py-4">
            <p className="text-sm font-medium text-blue-900">Manager Feedback</p>
            <p className="mt-1 whitespace-pre-line text-sm text-blue-800">
              {managerFeedback}
            </p>
          </div>
        )}

        <DeliverableBody
          deliverableType={deliverable.deliverable_type}
          contentMarkdown={deliverable.content_markdown}
          contentJson={deliverable.content_json}
          employeeName={employee.name}
          deliverableId={deliverable.id}
          sources={sources.map(({ citation_number, research_sources: source }) => ({
            citationNumber: citation_number,
            title: source.title,
            url: source.url,
            domain: source.domain,
            accessedAt: source.accessed_at,
          }))}
        />

        {sources.length > 0 && !rendersOwnSources(deliverable.deliverable_type) && (
          <section className="mt-6 rounded-lg border border-zinc-200 p-8">
            <h2 className="text-sm font-medium text-zinc-900">Sources</h2>
            <ol className="mt-4 space-y-4">
              {sources.map(({ citation_number, research_sources: source }) => (
                <li key={citation_number} className="flex gap-3 text-sm">
                  <span className="shrink-0 text-zinc-400">[{citation_number}]</span>
                  <div>
                    <p className="font-medium text-zinc-900">{source.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {source.domain}
                      {source.published_at &&
                        ` · published ${formatAssignedDate(source.published_at)}`}
                      {source.accessed_at &&
                        ` · accessed ${formatAssignedDate(source.accessed_at)}`}
                    </p>
                    {source.fetch_status !== "fetched" && (
                      <p
                        className="mt-1 text-xs text-amber-700"
                        title="Only a search summary was available for this source."
                      >
                        Limited source
                      </p>
                    )}
                    <a
                      href={source.url}
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
          </section>
        )}

        {versions.length > 1 && (
          <section className="mt-6 rounded-lg border border-zinc-200 p-6">
            <h2 className="text-sm font-medium text-zinc-900">Version History</h2>
            <ul className="mt-3 divide-y divide-zinc-100">
              {versions.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-zinc-900">
                      Version {entry.version}
                      {entry.id === deliverable.id && (
                        <span className="ml-2 text-xs font-normal text-zinc-400">
                          viewing
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {deliverableStatusLabel[entry.status]}
                      {entry.submitted_at &&
                        ` · submitted ${formatAssignedDate(entry.submitted_at)}`}
                    </p>
                  </div>
                  {entry.id !== deliverable.id && (
                    <Link
                      href={`/dashboard/deliverables/${entry.id}`}
                      className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Open
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/*
          What the deliverable is made of, when it is made of more than words.

          Above the review buttons, because a manager cannot decide on a
          soundtrack they have not heard. Audio plays in place and images show
          in place — asking somebody to download a file to review it is asking
          them not to review it.

          Every link is signed and expires. The bucket is private: what these
          employees produce belongs to the company that paid for it.
        */}
        {files.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-900">
              {files.length === 1 ? "The file" : `${files.length} files`}
            </h2>
            <ul className="mt-3 space-y-4">
              {files.map((file) => {
                const url = fileUrls.get(file.id);
                return (
                  <li
                    key={file.id}
                    className="rounded-lg border border-zinc-200 px-5 py-4"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-sm font-medium text-zinc-900">
                        {file.title}
                      </p>
                      <p className="shrink-0 text-xs text-zinc-400">
                        {formatSize(file.sizeBytes)}
                        {file.producedByBackend ? ` · ${file.producedByBackend}` : ""}
                      </p>
                    </div>
                    {file.description && (
                      <p className="mt-1 text-sm text-zinc-600">
                        {file.description}
                      </p>
                    )}

                    {!url ? (
                      <p className="mt-3 text-sm text-amber-700">
                        This file could not be opened. It may have been removed.
                      </p>
                    ) : file.kind === "audio" ? (
                      <audio controls src={url} className="mt-3 w-full" />
                    ) : file.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={file.title}
                        className="mt-3 max-h-96 w-auto rounded-md border border-zinc-100"
                      />
                    ) : (
                      <a
                        href={url}
                        className="mt-3 inline-block text-sm text-zinc-700 underline"
                      >
                        Download
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Offered on any version, not only approved ones. A manager who reads
            a report and immediately knows what to do next should not have to
            finish the review first. */}
        {nextSteps.length > 0 && colleagues.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-900">
              What {employee.name} says to do next
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Start one and the work gets divided up for you — you&apos;ll see
              who is doing what, and why, before anything begins.
            </p>
            <ul className="mt-3 space-y-3">
              {nextSteps.slice(0, 5).map((step, index) => (
                <li
                  key={`${step.slice(0, 24)}-${index}`}
                  className="rounded-lg border border-zinc-200 px-5 py-4"
                >
                  <p className="text-sm text-zinc-800">{step}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <NextStepAction step={step} />
                  </div>
                  {/*
                    Kept, but demoted to a line of small text. Choosing the
                    person by hand is occasionally the right call — the manager
                    knows things the plan does not — and taking it away
                    entirely would be a different kind of arrogance than the
                    one this change is fixing.
                  */}
                  <p className="mt-2 text-xs text-zinc-400">
                    or give it to{" "}
                    {colleagues.map((colleague, position) => (
                      <span key={colleague.id}>
                        {position > 0 && " · "}
                        <Link
                          href={`/dashboard/employees/${colleague.id}/assign?title=${encodeURIComponent(step.slice(0, 120))}`}
                          className="underline hover:text-zinc-700"
                        >
                          {colleague.employees!.name}
                        </Link>
                        {colleague.work_status !== "ready" && " (busy)"}
                      </span>
                    ))}{" "}
                    yourself
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {deliverable.status === "approved" && (
          <LearningPanel
            deliverableId={deliverable.id}
            companyEmployeeId={deliverable.company_employee_id}
            employeeName={employee.name}
          />
        )}

        {/* Above the review buttons: what the company's own standards make of
            this is part of reviewing it, not a footnote after the decision. */}
        {isPending && findings.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-900">
              Against your standards
            </h2>
            <ul className="mt-3 space-y-3">
              {findings.map((finding) => (
                <li
                  key={finding.id}
                  className="rounded-lg border border-zinc-200 px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        {finding.ruleTitle}
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-600">{finding.detail}</p>
                      <p className="mt-2 text-xs text-zinc-500">
                        {finding.policyName}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                        findingSeverityClass[finding.severity]
                      }`}
                    >
                      {findingSeverityLabel[finding.severity]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {blockingNow.length > 0 ? (
              <p className="mt-3 text-sm text-zinc-600">
                Approval waits on the required ones. Ask for changes, or turn the
                rule off in{" "}
                <Link href="/dashboard/policies" className="underline">
                  Company Standards
                </Link>{" "}
                if it doesn&apos;t apply here.
              </p>
            ) : (
              findings.some((finding) => finding.severity === "blocking") && (
                <p className="mt-3 text-sm text-zinc-600">
                  These were required when the work was done. You have since
                  relaxed those rules, so nothing here holds up an approval.
                </p>
              )
            )}
          </section>
        )}

        {isPending && (
          <ReviewActions deliverableId={deliverable.id} employeeName={employee.name} />
        )}
      </main>
    </div>
  );
}
