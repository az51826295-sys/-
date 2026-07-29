import type { WorkItemSummary } from "@/lib/projects/types";

/**
 * What one work item hands to the next.
 *
 * Extracted per deliverable type rather than generically: what a colleague can
 * build on differs by what was produced. A market report's useful output is the
 * segments it recommends; a lead list's is the companies it verified. Passing
 * whole documents instead would bury the one part that matters and cost tokens
 * for the rest.
 */
export interface DependencyOutput {
  /** Rendered into the dependent employee's brief. */
  text: string;
  /** Kept structured so a skill can read specific fields rather than parsing
   *  prose back out of the text. */
  json: unknown;
}

interface MarketReportContent {
  executiveSummary?: string;
  recommendedSegments?: { name?: string; reason?: string }[];
  keyImplications?: string[];
  sections?: { heading: string; content: string }[];
}

interface LeadListContent {
  executiveSummary?: string;
  verifiedCount?: number;
  leads?: {
    companyName?: string;
    websiteUrl?: string;
    fitLabel?: string;
    fitReasons?: string[];
  }[];
}

const MAX_ITEMS = 15;

export function extractDependencyOutput(
  deliverableType: string,
  contentJson: unknown,
  summary: WorkItemSummary | null,
): DependencyOutput {
  if (deliverableType === "market_research_report") {
    return fromMarketReport(contentJson as MarketReportContent | null, summary);
  }
  if (deliverableType === "lead_list") {
    return fromLeadList(contentJson as LeadListContent | null, summary);
  }
  return fromSummary(summary);
}

function fromMarketReport(
  content: MarketReportContent | null,
  summary: WorkItemSummary | null,
): DependencyOutput {
  const segments = (content?.recommendedSegments ?? [])
    .slice(0, MAX_ITEMS)
    .map((segment) => ({
      name: segment.name ?? "",
      reason: segment.reason ?? "",
    }))
    .filter((segment) => segment.name);

  const implications = (
    content?.keyImplications ??
    summary?.keyFindings ??
    []
  ).slice(0, MAX_ITEMS);

  const json = {
    recommendedSegments: segments,
    relevantSignals: implications,
  };

  const lines = [
    content?.executiveSummary ?? summary?.completedOutcome ?? "",
    segments.length > 0
      ? `\nRecommended customer segments:\n${segments
          .map((segment) => `- ${segment.name}${segment.reason ? ` — ${segment.reason}` : ""}`)
          .join("\n")}`
      : "",
    implications.length > 0
      ? `\nWhat this implies:\n${implications.map((item) => `- ${item}`).join("\n")}`
      : "",
  ].filter(Boolean);

  return { text: lines.join("\n"), json };
}

function fromLeadList(
  content: LeadListContent | null,
  summary: WorkItemSummary | null,
): DependencyOutput {
  const companies = (content?.leads ?? [])
    .slice(0, MAX_ITEMS)
    .map((lead) => ({
      companyName: lead.companyName ?? "",
      fitLabel: lead.fitLabel ?? "",
      fitReasons: (lead.fitReasons ?? []).slice(0, 2),
    }))
    .filter((lead) => lead.companyName);

  const json = {
    verifiedCompanyCount: content?.verifiedCount ?? companies.length,
    topCompanies: companies,
  };

  const lines = [
    content?.executiveSummary ?? summary?.completedOutcome ?? "",
    companies.length > 0
      ? `\nCompanies found:\n${companies
          .map(
            (company) =>
              `- ${company.companyName}${company.fitLabel ? ` (${company.fitLabel})` : ""}${
                company.fitReasons[0] ? ` — ${company.fitReasons[0]}` : ""
              }`,
          )
          .join("\n")}`
      : "",
  ].filter(Boolean);

  return { text: lines.join("\n"), json };
}

/** The fallback when a deliverable type has no specific extractor. Uses the
 *  summary rather than nothing, so a new employee type still hands something
 *  useful along before anybody writes an extractor for it. */
function fromSummary(summary: WorkItemSummary | null): DependencyOutput {
  if (!summary) return { text: "", json: {} };

  const lines = [
    summary.completedOutcome,
    summary.keyFindings.length > 0
      ? `\nFound:\n${summary.keyFindings.map((item) => `- ${item}`).join("\n")}`
      : "",
    summary.recommendations.length > 0
      ? `\nRecommended:\n${summary.recommendations.map((item) => `- ${item}`).join("\n")}`
      : "",
  ].filter(Boolean);

  return {
    text: lines.join("\n"),
    json: {
      keyFindings: summary.keyFindings,
      recommendations: summary.recommendations,
    },
  };
}
