import type { DeliverableOutput } from "@/lib/execution/types";

/** The parts of a deliverable that get rendered and citation-checked. First
 *  drafts and revisions both satisfy this; each has extra fields of its own. */
export type RenderableDeliverable = Pick<
  DeliverableOutput,
  | "title"
  | "executiveSummary"
  | "sections"
  | "keyImplications"
  | "recommendedNextSteps"
  | "limitations"
>;

export interface CitableSource {
  id: string;
  title: string;
  url: string;
  domain: string;
  publishedAt: string | null;
  accessedAt: string | null;
  fetchStatus: string;
}

export interface CitationAssignment {
  sourceId: string;
  citationNumber: number;
}

export type CitationCheck =
  | { ok: true; markdown: string; citations: CitationAssignment[] }
  | { ok: false; reason: string };

/**
 * Claims that must be backed by evidence. If a section reads like one of these
 * and carries no citation, the deliverable is rejected rather than published —
 * an unsourced price is worse than no price.
 */
const FACTUAL_CLAIM_PATTERNS: RegExp[] = [
  /\$\s?\d/,
  /\b\d+(\.\d+)?\s?%/,
  /\bper (month|year|seat|user)\b/i,
  /\b(pricing|price|priced|plan tiers?)\b/i,
  /\b(customers?|users?|seats?)\s+(count|base|number)\b/i,
  /\b(revenue|arr|mrr|valuation|funding|raised|acquisition|acquired|merger)\b/i,
  /\b(market share)\b/i,
  /\b(launched|launch date|released|announced|shipping)\b/i,
  /"[^"]{25,}"/,
];

function needsCitation(text: string): boolean {
  return FACTUAL_CLAIM_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Validates the model's citations against the sources it was actually given,
 * then renders the deliverable. The model only ever emits source ids — every
 * URL in the output is written here, from the database, so a hallucinated link
 * is not expressible.
 */
export function validateAndRender(
  // Only the rendered parts are needed, so a revision — which carries extra
  // fields of its own — checks out through the same path as a first draft.
  output: RenderableDeliverable,
  sources: CitableSource[],
  employeeName: string,
): CitationCheck {
  const byId = new Map(sources.map((source) => [source.id, source]));

  // Number sources in order of first appearance so [1] is the first thing cited.
  const numbers = new Map<string, number>();
  let next = 1;

  for (const section of output.sections) {
    for (const rawId of section.citations) {
      const id = rawId.trim();
      if (!byId.has(id)) {
        return { ok: false, reason: `unknown_source_id:${id}` };
      }
      if (!numbers.has(id)) {
        numbers.set(id, next);
        next += 1;
      }
    }
  }

  for (const section of output.sections) {
    if (section.citations.length === 0 && needsCitation(section.content)) {
      return { ok: false, reason: `uncited_factual_claim:${section.heading}` };
    }
  }

  const cited = [...numbers.entries()]
    .map(([id, number]) => ({ source: byId.get(id)!, number }))
    .sort((a, b) => a.number - b.number);

  const lines: string[] = [`# ${output.title}`, "", "## Executive Summary", "", output.executiveSummary];

  for (const section of output.sections) {
    const markers = section.citations
      .map((id) => numbers.get(id.trim()))
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => a - b)
      .map((n) => `[${n}]`)
      .join("");

    // The model sometimes writes markers inline as well. Its numbering comes
    // from its own reading order and won't match the numbering assigned here,
    // so a trailing run of them is dropped rather than shown twice.
    const content = section.content.replace(/(\s*\[\d+\])+\s*$/, "").trimEnd();

    lines.push("", `## ${section.heading}`, "", `${content}${markers ? ` ${markers}` : ""}`);
  }

  if (output.keyImplications.length > 0) {
    lines.push("", "## Implications", "");
    lines.push(...output.keyImplications.map((item) => `- ${item}`));
  }

  if (output.recommendedNextSteps.length > 0) {
    lines.push("", "## Recommended Next Steps", "");
    lines.push(...output.recommendedNextSteps.map((step, i) => `${i + 1}. ${step}`));
  }

  if (output.limitations.length > 0) {
    lines.push("", "## Limitations", "");
    lines.push(...output.limitations.map((item) => `- ${item}`));
  }

  if (cited.length > 0) {
    lines.push("", "## Sources", "");
    for (const { source, number } of cited) {
      const parts = [`[${number}] [${source.title}](${source.url})`];
      const meta = [
        source.domain,
        source.publishedAt
          ? `published ${new Date(source.publishedAt).toISOString().slice(0, 10)}`
          : null,
        source.fetchStatus === "fetched" ? null : "limited source",
      ].filter(Boolean);
      if (meta.length > 0) parts.push(`— ${meta.join(" · ")}`);
      lines.push(parts.join(" "));
    }
  } else {
    lines.push(
      "",
      "## Sources",
      "",
      `${employeeName} could not verify any of the findings above against a public source.`,
    );
  }

  return {
    ok: true,
    markdown: lines.join("\n"),
    citations: cited.map(({ source, number }) => ({
      sourceId: source.id,
      citationNumber: number,
    })),
  };
}
