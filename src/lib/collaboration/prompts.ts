import { WORKFORCE_OS_INSTRUCTIONS } from "@/lib/execution/prompts";
import type { EmployeeWorkContextV5 } from "@/lib/execution/context";
import type { Colleague } from "@/lib/collaboration/routing";
import type { CollaborationResult } from "@/lib/collaboration/engine";

/**
 * Asks an employee, mid-assignment, whether they need a colleague.
 *
 * Written to make "no" comfortable. An employee that reaches for help on every
 * assignment turns one piece of work into two and makes the manager wait twice
 * as long for the same answer — so the bar is whether their own deliverable
 * would be materially worse without it.
 */
export function buildCollaborationPrompt(
  context: EmployeeWorkContextV5,
  offers: {
    colleague: Colleague;
    capability: { id: string; label: string; produces: string };
  }[],
  researchSummary: string,
): { system: string; input: string } {
  const system = [
    WORKFORCE_OS_INSTRUCTIONS,
    "",
    context.employee.workInstructions,
    "",
    `## Your task now

You are partway through your own assignment. Before you write it up, decide
whether a colleague should do a piece of it.

Ask only if your deliverable would be materially worse without it — because the
work needs a skill you do not have, and the manager asked for something that
genuinely requires it.

Do not ask because:
- it would be nice to have more detail
- a colleague is available and idle
- the topic touches their area

Asking costs your colleague their afternoon and the manager their time. Most
assignments do not need it, and finishing your own work well is the job.

If you do ask, "requestDescription" is the whole brief. Your colleague cannot
ask you a follow-up question — they see only what you write. Say what you need,
what it is for, and what would make the result unusable.

Set "needsHelp" to false and leave the other fields empty when you can do this
yourself. That is the normal answer.`,
  ].join("\n");

  const input = [
    `You are ${context.employee.name}, ${context.employee.role} at ${context.company.name}.`,
    "",
    "## Your assignment",
    `Title: ${context.assignment.title}`,
    `Description: ${context.assignment.description}`,
    context.assignment.expectedOutcome
      ? `A good result looks like: ${context.assignment.expectedOutcome}`
      : null,
    "",
    "## What you have found so far",
    researchSummary,
    "",
    "## Colleagues you could ask",
    ...offers.map(
      ({ colleague, capability }) =>
        `- [${capability.id}] ${colleague.name}, ${colleague.role}${colleague.available ? "" : " (currently busy)"}\n  Can: ${capability.label}\n  Gives you: ${capability.produces}`,
    ),
    "",
    'Use the id in square brackets as "capabilityId" if you ask.',
  ]
    .filter(Boolean)
    .join("\n");

  return { system, input };
}

/**
 * The colleague's contribution, as the requester sees it while writing up.
 *
 * Presented as somebody else's work with their name on it, not as raw material:
 * the requester should be able to say where a finding came from, and a claim
 * that arrived second-hand still needs to be attributed.
 */
export function renderCollaboration(result: CollaborationResult | null): string {
  if (!result) return "";

  const lines = [
    "",
    `## What ${result.colleagueName} did for you`,
    "",
    `You asked ${result.colleagueName} (${result.colleagueRole}) to: ${result.requestTitle}`,
    "",
    result.summary,
  ];

  if (result.keyPoints.length > 0) {
    lines.push("", "What they found:", ...result.keyPoints.map((point) => `- ${point}`));
  }

  lines.push(
    "",
    `Use this in your deliverable and say it came from ${result.colleagueName}.`,
    "It is their work, and the manager should be able to tell which parts are",
    "yours and which are theirs.",
    "",
    "Their findings carry the same rules as your own: state what they verified",
    "as verified, and do not upgrade something they hedged into something",
    "certain. If their result does not cover what you needed, say so in your",
    "limitations rather than filling the gap yourself.",
  );

  return lines.join("\n");
}
