import type { DeliverableConfig, DeliverableSampleInput } from "./definitions";

/**
 * The sample an art director hands in before any model has run.
 *
 * Every employee has one so the hire-and-review loop can be exercised for free.
 * This one carries more weight than the others: it is the first sample of a
 * *created* deliverable rather than a researched one, and its job is to show
 * what "enforceable" looks like before anybody pays to find out.
 *
 * So the sample is deliberately specific — real hex codes, real file counts —
 * even though the game is imaginary. A placeholder full of "TBD" would teach
 * the manager that this document is a formality, which is the one impression
 * that would make the real thing useless.
 */
function buildMarkdown(input: DeliverableSampleInput): string {
  const company = input.companySummary
    ? `Written against how you described the company: ${input.companySummary}`
    : "";

  return [
    "# Art Bible — Sample",
    "",
    "**One accent colour carries the whole idea; everything else gets out of its way.**",
    "",
    "This is a worked example, not a bible for your project. It shows the shape a",
    "real one takes: every line here is something a finished file could pass or",
    "fail.",
    company ? `\n${company}` : "",
    "",
    "## Palette",
    "",
    "| Role | Colour | Where it goes |",
    "| --- | --- | --- |",
    "| Background, deep | `#1A1614` | The furthest layer. Never on a character. |",
    "| Structure | `#4A3F35` | Floors, platforms, anything you stand on |",
    "| Primary material | `#8B6F47` | Machinery, pipes, fittings |",
    "| Accent | `#4FE3C1` | The one mechanic that matters, and nothing else |",
    "| Danger | `#D14B3A` | Incoming damage only |",
    "",
    "## Rules",
    "",
    "- **`#4FE3C1` appears only on the core mechanic** — the moment it becomes",
    "  decoration, the player stops reading it as meaning anything.",
    "- **No pure black** — `#1A1614` is the floor. Pure black reads as a hole in",
    "  the screen rather than a dark room.",
    "- **One outline weight, 1px, `#1A1614`** — mixed weights make sprites drawn",
    "  by different hands look like they are from different games.",
    "",
    "## Naming",
    "",
    "`{group}_{subject}_{state}_{nn}.png`",
    "",
    "Example: `char_lead_idle_01.png`",
    "",
    "## Assets",
    "",
    "| Group | Files | Size | Format | Prefix |",
    "| --- | --- | --- | --- | --- |",
    "| Player character | 48 | 512×512 | PNG (alpha) | `char_lead_` |",
    "| Standard enemy | 24 | 512×512 | PNG (alpha) | `enemy_basic_` |",
    "| Tileset | 48 | 32×32 | PNG (alpha) | `tile_` |",
    "| UI icons | 24 | 64×64 | PNG (alpha) | `icon_` |",
    "",
    "**144 files in total.** A finished folder is checked against this number.",
    "",
    "## Prompt template",
    "",
    "```",
    "2D game sprite, side view, {subject}, {state} pose,",
    "palette limited to #1A1614 #4A3F35 #8B6F47, accent #4FE3C1 only on {mechanic},",
    "1px outline #1A1614, flat orthographic, no perspective,",
    "transparent background, {width}x{height}",
    "```",
    "",
    "## Not decided",
    "",
    "These were not in the brief and have deliberately not been invented.",
    "",
    "- How many playable characters there are",
    "- Whether backgrounds animate or are static plates",
    "- Target platform, which decides the minimum readable sprite size",
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export const irisDeliverable: DeliverableConfig = {
  type: "art_bible",
  label: "Art Bible",
  buildSample: (input) => ({
    title: "Art Bible — Sample",
    contentMarkdown: buildMarkdown(input),
  }),
};
