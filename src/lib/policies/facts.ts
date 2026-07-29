/**
 * What a checkable rule needs to know about a finished piece of work.
 *
 * Extraction is per deliverable type, the same way handing work between
 * colleagues is: a report's evidence lives in section citations, a lead list's
 * in per-company citation numbers. Normalising here is what lets a check like
 * "at least three sources" be written once and mean the right thing for both.
 */
export interface DeliverableFacts {
  deliverableType: string;
  title: string;
  contentMarkdown: string;
  /** The opening statement of what the work found. */
  summary: string;
  /** What the work says to do next. */
  actionItems: string[];
  /** What the work admitted it could not establish. */
  limitations: string[];
  /** Distinct sources the work actually stands on. */
  citedSourceCount: number;
  /** Parts that assert something with nothing behind them. */
  uncitedParts: string[];
}

interface ReportContent {
  title?: string;
  executiveSummary?: string;
  sections?: { heading?: string; content?: string; citations?: string[] }[];
  recommendedNextSteps?: string[];
  limitations?: string[];
}

interface LeadListContent {
  title?: string;
  executiveSummary?: string;
  leads?: {
    companyName?: string;
    citationNumbers?: number[];
    buyingSignals?: { citationNumbers?: number[] }[];
  }[];
  researchLimitations?: string[];
  recommendedNextSteps?: string[];
}

export function extractDeliverableFacts(
  deliverableType: string,
  title: string,
  contentMarkdown: string,
  contentJson: unknown,
): DeliverableFacts {
  const base = {
    deliverableType,
    title,
    contentMarkdown: contentMarkdown ?? "",
  };

  if (deliverableType === "lead_list") {
    return { ...base, ...fromLeadList(contentJson as LeadListContent | null) };
  }
  if (deliverableType === "art_bible") {
    return { ...base, ...fromArtBible(contentJson as ArtBibleContent | null) };
  }
  return { ...base, ...fromReport(contentJson as ReportContent | null) };
}

interface ArtBibleContent {
  oneLine?: string;
  rationale?: string;
  openQuestions?: string[];
}

/**
 * A created deliverable, mapped onto the same facts a researched one produces.
 *
 * Two of the five map honestly and are worth mapping rather than exempting.
 * The opening statement is the one-line direction plus why it is that way,
 * which is exactly what "opens with what it found" is asking for. What it could
 * not settle is the list of things the brief left open — the same admission a
 * report makes when the evidence ran out, and the most useful part of both.
 *
 * The rest are left empty on purpose: a bible has no sources and no next
 * actions, and the checks that look for those now say so themselves rather than
 * failing work that was never going to have them.
 */
function fromArtBible(content: ArtBibleContent | null) {
  const summary = [content?.oneLine, content?.rationale]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    summary,
    actionItems: [],
    limitations: (content?.openQuestions ?? []).filter(Boolean),
    citedSourceCount: 0,
    uncitedParts: [],
  };
}

function fromReport(content: ReportContent | null) {
  const sections = content?.sections ?? [];
  const cited = new Set<string>();

  for (const section of sections) {
    for (const citation of section.citations ?? []) {
      if (citation) cited.add(citation);
    }
  }

  // A heading with prose behind it and no citation is the shape of an unbacked
  // claim. Short sections are skipped: a one-line framing sentence is not a
  // factual assertion, and flagging it would train the manager to ignore this.
  const uncited = sections
    .filter(
      (section) =>
        (section.content ?? "").trim().length > 200 &&
        (section.citations ?? []).length === 0,
    )
    .map((section) => section.heading ?? "Untitled section");

  return {
    summary: content?.executiveSummary?.trim() ?? "",
    actionItems: (content?.recommendedNextSteps ?? []).filter(Boolean),
    limitations: (content?.limitations ?? []).filter(Boolean),
    citedSourceCount: cited.size,
    uncitedParts: uncited,
  };
}

function fromLeadList(content: LeadListContent | null) {
  const leads = content?.leads ?? [];
  const cited = new Set<number>();

  for (const lead of leads) {
    for (const number of lead.citationNumbers ?? []) cited.add(number);
    for (const signal of lead.buyingSignals ?? []) {
      for (const number of signal.citationNumbers ?? []) cited.add(number);
    }
  }

  // A company nobody could produce evidence for is the lead-list equivalent of
  // an uncited claim — it is the thing a salesperson would waste a call on.
  const uncited = leads
    .filter((lead) => (lead.citationNumbers ?? []).length === 0)
    .map((lead) => lead.companyName ?? "Unnamed company");

  return {
    summary: content?.executiveSummary?.trim() ?? "",
    actionItems: (content?.recommendedNextSteps ?? []).filter(Boolean),
    limitations: (content?.researchLimitations ?? []).filter(Boolean),
    citedSourceCount: cited.size,
    uncitedParts: uncited,
  };
}
