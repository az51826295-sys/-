// Free: does the mock fixture satisfy the schema AND the self-consistency checks?
import { artBibleOutputSchema, totalAssetCount } from "../src/lib/skills/artBible/schema.ts";
import { renderArtBible } from "../src/lib/skills/artBible/prompt.ts";
import { createMockAIProvider } from "../src/lib/providers/mock.ts";

const ai = createMockAIProvider();
const input = "## What you have been asked for\nWrite the art bible for our game";

const { output } = await ai.generateStructuredOutput({
  systemInstructions: "",
  input,
  schema: artBibleOutputSchema,
  schemaName: "art_bible",
});

console.log("\nschema parse         OK");
console.log("total assets        ", totalAssetCount(output));

// Mirror of findContradiction, so the fixture is checked the way the skill checks it.
const hexes = new Set(output.palette.map((e) => e.hex.toLowerCase()));
const problems = [];
for (const rule of output.forbidden)
  for (const hex of rule.rule.match(/#[0-9a-fA-F]{6}/g) ?? [])
    if (!hexes.has(hex.toLowerCase())) problems.push(`rule names ${hex}, not in palette`);
const roles = output.palette.map((e) => e.role.toLowerCase());
if (roles.some((r, i) => roles.indexOf(r) !== i)) problems.push("duplicate palette role");
const pre = output.assetGroups.map((g) => g.namePrefix.toLowerCase());
if (pre.some((p, i) => pre.indexOf(p) !== i)) problems.push("duplicate prefix");
for (const g of output.assetGroups)
  if (g.variants.length > g.fileCount) problems.push(`${g.name}: more states than files`);
if (![...hexes].some((h) => output.promptTemplate.toLowerCase().includes(h)))
  problems.push("prompt template carries no palette colour");

console.log("self-consistency    ", problems.length === 0 ? "PASS" : "FAIL " + problems.join("; "));
console.log("\n--- rendered ---\n");
console.log(renderArtBible(output).split("\n").slice(0, 26).join("\n"));
