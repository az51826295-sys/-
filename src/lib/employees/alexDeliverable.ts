import type { DeliverableConfig, DeliverableSampleInput } from "./definitions";

/**
 * Day 4 hands in a structured sample rather than generated research, so the
 * submit-and-review loop can be verified without a model call. The shape —
 * summary, findings with reasoning, implications, next steps — is the contract
 * a real deliverable will have to meet later.
 */
function buildCompetitorSection(name: string): string {
  return [
    `## ${name}`,
    "",
    `${name} is an established player in this space, with recognisable branding and a broad feature set.`,
    "",
    "Potential weakness:",
    "",
    `Breadth comes at a cost — smaller teams may find ${name} heavier to set up and administer than they need.`,
  ].join("\n");
}

function buildMarkdown(input: DeliverableSampleInput): string {
  const competitors = input.competitors.length > 0 ? input.competitors : ["Not specified"];

  const sections: string[] = [
    "# Executive Summary",
    "",
    "The market is led by established platforms with broad product suites. The strongest opening for us is to position around simplicity, faster setup, and a sharper focus on the customers we already serve well.",
  ];

  if (input.companySummary) {
    sections.push("", `This reads against how you described the company: ${input.companySummary}`);
  }

  sections.push("", "# Competitors Reviewed", "");
  sections.push(...competitors.map((name) => `- ${name}`));

  sections.push("", "# Key Findings", "");
  sections.push(
    competitors
      .filter((name) => name !== "Not specified")
      .map(buildCompetitorSection)
      .join("\n\n") ||
      "No competitors were listed during onboarding, so this section is based on the market at large.",
  );

  sections.push("", "# Evidence and Reasoning", "");
  sections.push(
    "Each finding above is drawn from how these companies describe themselves publicly — their positioning pages, plan structures, and the audience their marketing addresses. Where a weakness is noted, it reflects a mismatch between that positioning and the customers you told me you serve, not a judgement on product quality.",
  );

  if (input.customerSummary) {
    sections.push("", `Your customers, as you described them: ${input.customerSummary}`);
  }

  sections.push("", "# Strategic Opportunity", "");
  sections.push(
    [
      "We can differentiate by emphasising:",
      "",
      "- Faster setup",
      "- Simpler workflows",
      "- Transparent pricing",
      "- A product shaped around the customers we serve",
    ].join("\n"),
  );

  if (input.differentiationSummary) {
    sections.push("", `You already framed this as: ${input.differentiationSummary}`);
  }

  sections.push("", "# Implications", "");
  sections.push(
    "If the pattern above holds, the risk is competing on feature count, where the incumbents are strongest. The opportunity is to compete on time-to-value, where their breadth works against them.",
  );

  sections.push("", "# Recommended Next Steps", "");
  const steps = [
    "Compare competitor pricing in greater detail.",
    "Review customer complaints from public review sites.",
    "Test messaging around simplicity and speed.",
  ];

  if (input.priorities.length > 0) {
    steps.push(`Keep watching what you flagged as most important: ${input.priorities.join(", ")}.`);
  }

  sections.push(...steps.map((step, index) => `${index + 1}. ${step}`));

  return sections.join("\n");
}

export const alexDeliverable: DeliverableConfig = {
  type: "market_research_report",
  label: "Market Research Report",
  buildSample: (input) => ({
    title: "Competitive Landscape Analysis",
    contentMarkdown: buildMarkdown(input),
  }),
};
