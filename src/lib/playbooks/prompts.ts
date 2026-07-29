import type { PlaybookSnapshot } from "@/lib/playbooks/types";

/**
 * The company's method, given to the employee doing the work.
 *
 * Written as how this company does it rather than as a procedure to execute.
 * The difference matters: an employee following a procedure stops thinking, and
 * the thing that makes this work worth paying for is that they don't. The
 * playbook says what order to work in and what each stage should leave behind —
 * it does not say what to conclude.
 */
export function renderPlaybook(snapshot: PlaybookSnapshot | null): string {
  if (!snapshot || snapshot.stages.length === 0) return "";

  const lines: string[] = [
    "",
    `## How this company does this work — ${snapshot.name} (v${snapshot.version})`,
    "",
    "This is your company's method for work of this kind. Work through it in",
    "order. Each stage says what it is for and what it should leave behind.",
  ];

  for (const [index, stage] of snapshot.stages.entries()) {
    lines.push("", `${index + 1}. ${stage.title}`);
    if (stage.intent) lines.push(`   ${stage.intent}`);

    for (const step of stage.steps) {
      lines.push(
        `   - ${step.instruction}${step.required ? "" : " (only where it applies)"}`,
      );
      if (step.expectedOutput) {
        lines.push(`     Should produce: ${step.expectedOutput}`);
      }
    }
  }

  if (snapshot.qualityChecks.length > 0) {
    lines.push("", "### What this company considers finished");
    for (const check of snapshot.qualityChecks) {
      lines.push(
        `- ${check.title}${check.description ? `: ${check.description}` : ""}`,
      );
    }
  }

  lines.push(
    "",
    "Two limits on the method. It sets the order and the standard, never the",
    "conclusion — if the evidence points somewhere the method did not expect,",
    "follow the evidence and say so. And a stage you genuinely could not",
    "complete is reported as incomplete, not skipped quietly: the manager needs",
    "to know which part of the method the work actually rests on.",
  );

  return lines.join("\n");
}

/**
 * The one-line form, for planning rather than doing.
 *
 * A plan does not need the steps — it needs to know a method exists and what it
 * covers, so it does not invent a different way of working for the same job.
 */
export function renderPlaybookDigest(
  playbooks: { name: string; version: number; skillLabel: string; stages: string[] }[],
): string {
  if (playbooks.length === 0) return "";

  return [
    "",
    "## Methods this company already has",
    ...playbooks.map(
      (playbook) =>
        `- ${playbook.name} (v${playbook.version}) for ${playbook.skillLabel}: ${playbook.stages.join(" → ")}`,
    ),
    "",
    "Where a method exists for the work, plan around it rather than inventing a",
    "different sequence for the same job.",
  ].join("\n");
}
