import type { DeliverableConfig, DeliverableSampleInput } from "./definitions";

/**
 * The sample kept for parity with Alex's. A real lead list is generated from
 * stored candidates, so this exists only for the paths that predate execution —
 * it deliberately contains no company names, because a placeholder company in a
 * prospect list is exactly the kind of invention Emma must never produce.
 */
function buildMarkdown(input: DeliverableSampleInput): string {
  const sections: string[] = [
    "# Executive Summary",
    "",
    "This is a placeholder lead list. Emma builds a real one by researching companies against your ideal customer profile and recording the evidence behind each row.",
  ];

  if (input.customerSummary) {
    sections.push("", `Who you told Emma you serve: ${input.customerSummary}`);
  }

  sections.push(
    "",
    "# Leads",
    "",
    "No companies have been researched yet, so no leads are listed. Emma does not fill a list with examples.",
    "",
    "# Limitations",
    "",
    "This deliverable was not produced from research.",
  );

  return sections.join("\n");
}

export const emmaDeliverable: DeliverableConfig = {
  type: "lead_list",
  label: "Lead List",
  buildSample: (input) => ({
    title: "Prospect List",
    contentMarkdown: buildMarkdown(input),
  }),
};
