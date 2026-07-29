"use client";

import { useMemo, useState } from "react";
import {
  fitLabelText,
  type FitLabel,
  type LeadListDeliverable,
  type LeadListRow,
} from "@/lib/leads/types";

const FIT_CLASS: Record<FitLabel, string> = {
  strong_fit: "bg-green-50 text-green-700",
  good_fit: "bg-blue-50 text-blue-700",
  possible_fit: "bg-zinc-100 text-zinc-600",
};

const FILTERS: { value: "all" | FitLabel; label: string }[] = [
  { value: "all", label: "All" },
  { value: "strong_fit", label: "Strong Fit" },
  { value: "good_fit", label: "Good Fit" },
  { value: "possible_fit", label: "Possible Fit" },
];

export interface EvidenceSource {
  citationNumber: number;
  title: string;
  url: string;
  domain: string;
  accessedAt: string | null;
}

/**
 * A lead list is a table, not a document. The manager's question for each row is
 * "should someone contact this company, and why" — so fit, reason and evidence
 * are the columns that never collapse, and the rest can hide on a narrow screen.
 */
export function LeadListViewer({
  deliverable,
  sources,
  employeeName,
  canExport,
  deliverableId,
}: {
  deliverable: LeadListDeliverable;
  sources: EvidenceSource[];
  employeeName: string;
  canExport: boolean;
  deliverableId: string;
}) {
  const [filter, setFilter] = useState<"all" | FitLabel>("all");
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  const sourceByNumber = useMemo(
    () => new Map(sources.map((source) => [source.citationNumber, source])),
    [sources],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: deliverable.leads.length };
    for (const lead of deliverable.leads) {
      map[lead.fitLabel] = (map[lead.fitLabel] ?? 0) + 1;
    }
    return map;
  }, [deliverable.leads]);

  const visible = useMemo(
    () =>
      filter === "all"
        ? deliverable.leads
        : deliverable.leads.filter((lead) => lead.fitLabel === filter),
    [deliverable.leads, filter],
  );

  const openLead = deliverable.leads.find((lead) => lead.leadCandidateId === openLeadId);

  return (
    <div>
      <section className="mt-6 rounded-lg border border-zinc-200 p-6">
        <p className="text-sm text-zinc-700">{deliverable.executiveSummary}</p>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Companies requested" value={deliverable.requestedCount} />
          <Stat label="Verified leads" value={deliverable.verifiedCount} />
          <Stat label="Strong fit" value={counts.strong_fit ?? 0} />
          <Stat label="Good fit" value={counts.good_fit ?? 0} />
        </dl>

        {(deliverable.targetProfileSummary.industries.length > 0 ||
          deliverable.targetProfileSummary.locations.length > 0) && (
          <div className="mt-5 border-t border-zinc-100 pt-5 text-xs text-zinc-500">
            {deliverable.targetProfileSummary.industries.length > 0 && (
              <p>
                Industries: {deliverable.targetProfileSummary.industries.join(", ")}
              </p>
            )}
            {deliverable.targetProfileSummary.locations.length > 0 && (
              <p>Locations: {deliverable.targetProfileSummary.locations.join(", ")}</p>
            )}
            {deliverable.targetProfileSummary.employeeRange && (
              <p>Company size: {deliverable.targetProfileSummary.employeeRange}</p>
            )}
          </div>
        )}
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((option) => {
            const count = counts[option.value] ?? 0;
            if (option.value !== "all" && count === 0) return null;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                  filter === option.value
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {option.label} ({count})
              </button>
            );
          })}
        </div>

        {canExport && (
          <a
            href={`/api/deliverables/${deliverableId}/export.csv`}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Download CSV
          </a>
        )}
      </div>

      {/* The table scrolls inside itself rather than pushing the page sideways. */}
      <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
              <Th>Company</Th>
              <Th>Fit</Th>
              <Th>Industry</Th>
              <Th>Size</Th>
              <Th>Location</Th>
              <Th>Why It Fits</Th>
              <Th>Evidence</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {visible.map((lead) => (
              <tr key={lead.leadCandidateId} className="border-b border-zinc-100">
                <td className="px-4 py-3 align-top">
                  <p className="font-medium text-zinc-900">{lead.companyName}</p>
                  <a
                    href={lead.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-xs text-zinc-500 underline"
                  >
                    {new URL(lead.websiteUrl).hostname.replace(/^www\./, "")}
                  </a>
                </td>
                <td className="px-4 py-3 align-top">
                  <span
                    className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${FIT_CLASS[lead.fitLabel]}`}
                  >
                    {fitLabelText[lead.fitLabel]}
                  </span>
                </td>
                <td className="px-4 py-3 align-top text-zinc-700">
                  {lead.industry ?? "—"}
                </td>
                <td className="px-4 py-3 align-top text-zinc-700">
                  {lead.companySize ?? (
                    <span className="text-zinc-400">Not published</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-zinc-700">
                  {lead.location ?? "—"}
                </td>
                <td className="max-w-xs px-4 py-3 align-top text-zinc-700">
                  {lead.fitReasons[0] ?? "—"}
                  {lead.buyingSignals.length > 0 && (
                    <p className="mt-1 text-xs text-zinc-500">
                      {lead.buyingSignals[0].description}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-xs text-zinc-500">
                  {lead.citationNumbers.length +
                    lead.buyingSignals.reduce(
                      (total, signal) => total + signal.citationNumbers.length,
                      0,
                    )}{" "}
                  sources
                </td>
                <td className="px-4 py-3 align-top">
                  <button
                    type="button"
                    onClick={() => setOpenLeadId(lead.leadCandidateId)}
                    className="whitespace-nowrap rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    View Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && (
        <p className="mt-3 text-sm text-zinc-500">No leads in this band.</p>
      )}

      {deliverable.researchLimitations.length > 0 && (
        <section className="mt-6 rounded-lg border border-zinc-200 p-6">
          <h2 className="text-sm font-medium text-zinc-900">
            What {employeeName} could not verify
          </h2>
          <ul className="mt-3 space-y-2">
            {deliverable.researchLimitations.map((item, index) => (
              <li key={index} className="text-sm text-zinc-600">
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {deliverable.recommendedNextSteps.length > 0 && (
        <section className="mt-6 rounded-lg border border-zinc-200 p-6">
          <h2 className="text-sm font-medium text-zinc-900">Recommended Next Steps</h2>
          <ol className="mt-3 space-y-2">
            {deliverable.recommendedNextSteps.map((step, index) => (
              <li key={index} className="text-sm text-zinc-700">
                {index + 1}. {step}
              </li>
            ))}
          </ol>
        </section>
      )}

      {openLead && (
        <LeadDetail
          lead={openLead}
          sourceByNumber={sourceByNumber}
          employeeName={employeeName}
          onClose={() => setOpenLeadId(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold text-zinc-900">{value}</dd>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
      {children}
    </th>
  );
}

function LeadDetail({
  lead,
  sourceByNumber,
  employeeName,
  onClose,
}: {
  lead: LeadListRow;
  sourceByNumber: Map<number, EvidenceSource>;
  employeeName: string;
  onClose: () => void;
}) {
  const evidenceNumbers = [
    ...new Set([
      ...lead.citationNumbers,
      ...lead.buyingSignals.flatMap((signal) => signal.citationNumbers),
      ...lead.verifiedContacts.flatMap((contact) => contact.citationNumbers),
    ]),
  ].sort((a, b) => a - b);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-900/30">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 cursor-default"
      />
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{lead.companyName}</h2>
            <a
              href={lead.websiteUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-xs text-zinc-500 underline"
            >
              {lead.websiteUrl}
            </a>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            Close
          </button>
        </div>

        <span
          className={`mt-3 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${FIT_CLASS[lead.fitLabel]}`}
        >
          {fitLabelText[lead.fitLabel]}
        </span>

        <section className="mt-6">
          <h3 className="text-sm font-medium text-zinc-900">
            Why {employeeName} selected this company
          </h3>
          <ul className="mt-2 space-y-1.5">
            {lead.fitReasons.map((reason, index) => (
              <li key={index} className="text-sm text-zinc-700">
                <span className="text-zinc-400">&bull;</span> {reason}
              </li>
            ))}
          </ul>
        </section>

        {lead.buyingSignals.length > 0 && (
          <section className="mt-6">
            <h3 className="text-sm font-medium text-zinc-900">Buying Signals</h3>
            <ul className="mt-2 space-y-2">
              {lead.buyingSignals.map((signal, index) => (
                <li key={index} className="text-sm text-zinc-700">
                  {signal.description}
                  <span className="ml-1 text-xs text-zinc-400">
                    [{signal.citationNumbers.join(", ")}]
                  </span>
                  {signal.observedAt && (
                    <span className="block text-xs text-zinc-500">
                      Observed {signal.observedAt}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6">
          <h3 className="text-sm font-medium text-zinc-900">Recommended Buyer Roles</h3>
          {lead.recommendedBuyerRoles.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {lead.recommendedBuyerRoles.map((role) => (
                <li key={role} className="text-sm text-zinc-700">
                  {role}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">None identified.</p>
          )}
        </section>

        {/* A company with no named contact is still a usable lead. Saying so
            plainly is better than leaving a blank that reads like a failure. */}
        <section className="mt-6">
          <h3 className="text-sm font-medium text-zinc-900">Verified Contact</h3>
          {lead.verifiedContacts.length > 0 ? (
            <ul className="mt-2 space-y-3">
              {lead.verifiedContacts.map((contact) => (
                <li key={`${contact.name}-${contact.title}`}>
                  <p className="text-sm font-medium text-zinc-900">{contact.name}</p>
                  <p className="text-sm text-zinc-600">{contact.title}</p>
                  {contact.profileUrl && (
                    <a
                      href={contact.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="mt-1 inline-block text-xs text-zinc-700 underline"
                    >
                      Open public profile
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-600">
              No current contact was verified for this company.
            </p>
          )}
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-medium text-zinc-900">Contact Route</h3>
          <p className="mt-2 text-sm text-zinc-700">
            {lead.publicContactEmail ?? (
              <span className="text-zinc-500">Not publicly available</span>
            )}
          </p>
        </section>

        {lead.limitations.length > 0 && (
          <section className="mt-6">
            <h3 className="text-sm font-medium text-zinc-900">Limitations</h3>
            <ul className="mt-2 space-y-1">
              {lead.limitations.map((item, index) => (
                <li key={index} className="text-sm text-zinc-600">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6 border-t border-zinc-100 pt-6">
          <h3 className="text-sm font-medium text-zinc-900">Evidence</h3>
          <ol className="mt-2 space-y-3">
            {evidenceNumbers.map((number) => {
              const source = sourceByNumber.get(number);
              if (!source) return null;
              return (
                <li key={number} className="flex gap-2 text-sm">
                  <span className="shrink-0 text-zinc-400">[{number}]</span>
                  <div>
                    <p className="text-zinc-900">{source.title}</p>
                    <p className="text-xs text-zinc-500">{source.domain}</p>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="mt-0.5 inline-block text-xs text-zinc-700 underline"
                    >
                      Open source
                    </a>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}
