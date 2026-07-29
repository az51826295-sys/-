import type { EmployeeWorkContextV5 } from "@/lib/execution/context";
import type { ArtBibleOutput } from "./schema";

/**
 * The brief an art director works from.
 *
 * Written against a different problem than every other prompt here. The
 * research prompts spend most of their length teaching an employee not to
 * overstate what the sources support — because there, being wrong means
 * asserting something untrue about the world.
 *
 * There is nothing to be wrong about here. An art bible invents its subject.
 * What replaces accuracy as the thing to protect is *decidability*: every line
 * has to be something a later file can be checked against. "Warm, nostalgic
 * palette" is a sentence nobody can fail. "#8B6F47 on structures, never on
 * characters" is a sentence a file can fail, which is the only reason writing
 * it down is worth the money.
 */
export function buildArtBiblePrompt(
  context: EmployeeWorkContextV5,
  objective: string,
): { system: string; input: string } {
  const system = `You are ${context.employee.name}, ${context.employee.role}, writing the art
bible for a game this company is making.

An art bible is not a mood board in words. It is the document every asset gets
checked against, so it is worth exactly as much as the number of decisions in
it that a finished file could fail.

## What makes this document good

Write decisions, not adjectives. "Muted, melancholy tones" cannot be complied
with or violated. "Backgrounds use only #2E2823 and darker; no background
element may carry the accent colour" can be both, which is what makes it worth
writing down.

Every colour is a hex code and a job. A palette entry says where the colour
goes and — the part people skip — where it must not. A palette with no
prohibitions is a suggestion.

Reserve the accent. Pick exactly one colour that means one thing in this game,
and forbid it everywhere else. That single rule teaches the player to read the
screen faster than any amount of tutorial, and it is the first thing that
breaks when somebody uses the accent as decoration.

Size the work honestly. Every asset group states how many files it actually
contains when finished. Not a range, not "several" — a number, because that
number is what a finished folder gets counted against. A group of character
sprites with six states at eight frames is 48 files, and saying "48" is the
difference between a plan and a wish.

## How long this should be

Short. At most twelve asset groups, and fewer is usually right — group by what
gets made the same way, not by every distinct thing in the game. "Enemies" is
one group with variants; it is not eight groups.

Every sentence here gets read before every asset gets made, and a document
nobody finishes reading constrains nothing. If you find yourself listing rather
than deciding, stop and put what is left in "openQuestions".

## What not to do

Do not invent facts about the game that were not given to you. If the brief
does not say how many playable characters there are, do not decide — put it in
"openQuestions". Inventing it means every asset after this is built on
something nobody agreed to.

Do not write a style you cannot specify. If you want a look but cannot express
it as colours, dimensions and prohibitions, it will not survive contact with
whoever or whatever produces the files.

Do not pad. A short bible whose every line is enforceable beats a long one that
reads well and decides nothing.

## The prompt template

Write one reusable skeleton with {placeholders}, carrying the palette and the
format constraints, so producing the hundredth asset is the same act as
producing the first. Somebody should be able to fill in the blanks without
having read the rest of this document.`;

  const input = [
    `You are ${context.employee.name}, ${context.employee.role}.`,
    "",
    "## The company",
    context.companyKnowledge.companySummary,
    context.companyKnowledge.customerSummary
      ? `Who it is for: ${context.companyKnowledge.customerSummary}`
      : "",
    "",
    "## What you have been asked for",
    objective,
  ]
    .filter(Boolean)
    .join("\n");

  return { system, input };
}

/**
 * The bible as the manager reads it.
 *
 * Rendered server-side from the structured output for the same reason every
 * other deliverable is: the tables are the specification, and letting the model
 * format them means the numbers a later check depends on could arrive as prose.
 */
export function renderArtBible(bible: ArtBibleOutput): string {
  const lines: string[] = [
    `# ${bible.title}`,
    "",
    `**${bible.oneLine}**`,
    "",
    bible.rationale,
    "",
    "## Palette",
    "",
    "| Role | Colour | Where it goes |",
    "| --- | --- | --- |",
    ...bible.palette.map(
      (entry) => `| ${entry.role} | \`${entry.hex}\` | ${entry.usage} |`,
    ),
    "",
    "## Rules",
    "",
    ...bible.forbidden.map((rule) => `- **${rule.rule}** — ${rule.reason}`),
    "",
    "## Naming",
    "",
    `\`${bible.namingConvention.pattern}\``,
    "",
    `Example: \`${bible.namingConvention.example}\``,
    "",
    "## Assets",
    "",
    "| Group | Files | Size | Format | Prefix |",
    "| --- | --- | --- | --- | --- |",
    ...bible.assetGroups.map(
      (group) =>
        `| ${group.name} | ${group.fileCount} | ${group.widthPx}×${group.heightPx} | ${group.format.toUpperCase()}${group.transparentBackground ? " (alpha)" : ""} | \`${group.namePrefix}\` |`,
    ),
    "",
    `**${bible.assetGroups.reduce((sum, g) => sum + g.fileCount, 0)} files in total.**`,
    " A finished folder is checked against this number.",
    "",
  ];

  for (const group of bible.assetGroups) {
    if (group.variants.length === 0 && !group.notes) continue;
    lines.push(`### ${group.name}`, "");
    if (group.variants.length > 0) {
      lines.push(`States: ${group.variants.join(" · ")}`, "");
    }
    if (group.notes) lines.push(group.notes, "");
  }

  lines.push(
    "## Prompt template",
    "",
    "```",
    bible.promptTemplate,
    "```",
    "",
  );

  if (bible.openQuestions.length > 0) {
    lines.push(
      "## Not decided",
      "",
      "These were not in the brief and have deliberately not been invented.",
      "",
      ...bible.openQuestions.map((question) => `- ${question}`),
      "",
    );
  }

  return lines.join("\n");
}
