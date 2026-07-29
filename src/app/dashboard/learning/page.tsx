import { redirect } from "next/navigation";
import Link from "next/link";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { NavBar } from "@/components/NavBar";
import {
  loadCandidates,
  loadKnowledge,
  loadPlaybookDrafts,
} from "@/lib/knowledge/service";
import { formatAssignedDate } from "@/lib/assignments/labels";
import {
  candidateStatusClass,
  candidateStatusLabel,
  confidenceLabel,
  knowledgeCategoryLabel,
} from "@/lib/knowledge/types";
import { CandidateActions, DraftActions } from "./LearningActions";

export default async function LearningPage() {
  const company = await getCompanyContext();
  if (!company) redirect("/company/new");

  const candidates = await loadCandidates(company.supabase, company.companyId);
  const knowledge = await loadKnowledge(company.supabase, company.companyId);
  const drafts = await loadPlaybookDrafts(company.supabase, company.companyId);

  const pending = candidates.filter((row) => row.status === "pending");
  const decided = candidates.filter((row) => row.status !== "pending");
  const adopted = knowledge.filter((row) => row.status === "active");

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">Company Brain</h1>
        <p className="mt-1 text-sm text-zinc-500">
          What your company has worked out for itself. Your employees’ work
          suggests it; nothing reaches anybody until you agree.
        </p>

        <dl className="mt-6 grid grid-cols-3 gap-3">
          {[
            { label: "Waiting on you", value: pending.length },
            { label: "Adopted", value: adopted.length },
            { label: "Method changes", value: drafts.length },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-zinc-200 px-4 py-3">
              <dt className="text-xs text-zinc-500">{item.label}</dt>
              <dd className="mt-1 text-xl font-semibold text-zinc-900">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        {pending.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-600">
            Nothing waiting. Proposals appear here when you run learning on work
            you&apos;ve approved — and most approved work produces none, which is
            the bar working rather than failing.
          </p>
        ) : (
          <section className="mt-8">
            <h2 className="text-sm font-medium text-zinc-900">
              Proposed for the whole company
            </h2>
            <ul className="mt-3 space-y-3">
              {pending.map((candidate) => (
                <li
                  key={candidate.id}
                  className="rounded-lg border border-zinc-200 p-5"
                >
                  <p className="text-sm font-medium text-zinc-900">
                    {candidate.title}
                  </p>
                  <p className="mt-1 text-sm text-zinc-700">{candidate.summary}</p>
                  <p className="mt-2 text-sm text-zinc-600">
                    Why the company and not just {candidate.employeeName ?? "them"}:{" "}
                    {candidate.reason}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {knowledgeCategoryLabel[candidate.category]} ·{" "}
                    {confidenceLabel[candidate.confidence] ?? candidate.confidence}
                    {candidate.employeeName && ` · from ${candidate.employeeName}'s work`}
                    {candidate.deliverableId && (
                      <>
                        {" · "}
                        <Link
                          href={`/dashboard/deliverables/${candidate.deliverableId}`}
                          className="underline"
                        >
                          {candidate.deliverableTitle ?? "read the work"}
                        </Link>
                      </>
                    )}
                  </p>
                  <CandidateActions candidateId={candidate.id} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {drafts.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-900">
              Changes to how the work is done
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Drawn from what you adopted. Applying adds the step to the method;
              it only takes effect when you publish that playbook.
            </p>
            <ul className="mt-3 space-y-3">
              {drafts.map((draft) => (
                <li key={draft.id} className="rounded-lg border border-zinc-200 p-5">
                  <p className="text-sm font-medium text-zinc-900">
                    {draft.playbookName}
                  </p>
                  <p className="mt-1 text-sm text-zinc-700">{draft.changeSummary}</p>
                  <p className="mt-2 text-sm text-zinc-600">
                    Would add: {draft.proposedStepInstruction}
                  </p>
                  <DraftActions draftId={draft.id} playbookId={draft.playbookId} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {adopted.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-900">
              What this company knows
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Every employee gets these, including ones you hire tomorrow.
            </p>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {adopted.map((item) => (
                <li key={item.id} className="px-5 py-4">
                  <p className="text-sm font-medium text-zinc-900">{item.title}</p>
                  <p className="mt-0.5 text-sm text-zinc-600">{item.description}</p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {knowledgeCategoryLabel[item.category]}
                    {item.sourceCount > 0
                      ? ` · from ${item.sourceCount} piece${item.sourceCount === 1 ? "" : "s"} of work`
                      : " · no source recorded"}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {decided.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-900">Already decided</h2>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {decided.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex items-start justify-between gap-4 px-5 py-3"
                >
                  <div>
                    <p className="text-sm text-zinc-900">{candidate.title}</p>
                    {candidate.managerNote && (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        You said: {candidate.managerNote}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {formatAssignedDate(candidate.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                      candidateStatusClass[candidate.status]
                    }`}
                  >
                    {candidateStatusLabel[candidate.status]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
