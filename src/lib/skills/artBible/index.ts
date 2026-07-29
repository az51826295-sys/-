import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { ExecutionError, setStep } from "@/lib/execution/shared";
import { recordAppliedMemories } from "@/lib/memory/retrieval";
import type { EmployeeSkill, SkillRunContext } from "@/lib/skills/types";
import { buildArtBiblePrompt, renderArtBible } from "./prompt";
import { artBibleOutputSchema, totalAssetCount, type ArtBibleOutput } from "./schema";

/**
 * The first skill here that makes something up.
 *
 * Every other skill in this product is a research pipeline: search, fetch,
 * read, write, and refuse to publish if the citations do not check out. None of
 * that applies to an art bible. There is nothing to search for, because the
 * subject does not exist until this document says it does.
 *
 * So this skill is deliberately short — one model call and a validation pass —
 * and the interesting part is what replaces citation checking. A research
 * deliverable is rejected when it claims something its sources do not support.
 * This one is rejected when it contradicts *itself*: a palette rule naming a
 * colour that is not in the palette, an asset group whose stated file count
 * disagrees with its own variants, a prompt template that does not mention the
 * accent it just made a rule about.
 *
 * Those are the failures that make a bible useless later, and they are all
 * checkable for free.
 */

/** A bible that commits the company to more files than this is almost
 *  certainly a scoping mistake rather than a plan. */
const MAX_TOTAL_ASSETS = 2000;

export const artBibleSkill: EmployeeSkill = {
  id: "art_bible",
  deliverableType: "art_bible",
  capabilities: [
    {
      id: "visual_direction",
      label: "Decide how something should look, in enforceable terms",
      produces:
        "A palette with hex codes and prohibitions, a named asset list with counts and dimensions, and a reusable prompt template.",
    },
  ],
  acceptsInternalRequests: true,

  async run(ctx: SkillRunContext) {
    const { supabase, executionId, providers, context, memories } = ctx;

    const definition = getEmployeeDefinition(context.employee.slug);

    await setStep(supabase, executionId, "context_loaded");

    const objective = [
      context.assignment.title,
      context.assignment.description,
      context.assignment.expectedOutcome
        ? `What a good result looks like: ${context.assignment.expectedOutcome}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const { system, input } = buildArtBiblePrompt(context, objective);

    await setStep(supabase, executionId, "generating");

    // One attempt. No automatic retry.
    //
    // The research skills regenerate once on a citation failure, and copying
    // that here was a mistake that cost real money: a report's output is around
    // 900 tokens, and an art bible's is twelve thousand, so the retry that is
    // cheap insurance there doubles the bill on a document the manager may not
    // even want regenerated.
    //
    // The failure is also more useful than a citation failure. "The rule names
    // #4FE3C1, which is not in the palette" tells the manager exactly what to
    // say differently — and a brief that produced a contradictory bible will
    // often produce another one, so paying twice buys a coin toss rather than a
    // correction.
    {
      const { output } = await providers.ai.generateStructuredOutput({
        systemInstructions: system,
        input,
        schema: artBibleOutputSchema,
        schemaName: "art_bible",
        maxTokens: 16000,
      });

      const problem = findContradiction(output);
      if (problem) {
        throw new ExecutionError("SELF_INCONSISTENT", problem);
      }

      await setStep(supabase, executionId, "submitting");

      const { data, error } = await supabase.rpc("submit_generated_deliverable", {
        p_execution_id: executionId,
        p_title: output.title,
        p_deliverable_type: definition?.deliverable.type ?? "art_bible",
        p_content_markdown: renderArtBible(output),
        p_content_json: output,
        p_generation_model: providers.ai.model,
        // Empty on purpose, and the reason this skill exists as its own thing.
        // A research deliverable without citations is unfinished; an invented
        // one with citations would be pretending its decisions came from
        // somewhere they did not.
        p_citations: [],
      });

      if (error) throw new ExecutionError("DELIVERABLE_SAVE_FAILED", error.message);

      const rpc = data as { ok: boolean; reason?: string; deliverableId?: string };
      if (!rpc.ok) {
        if (rpc.reason === "already_submitted" && rpc.deliverableId) {
          return {
            deliverableId: rpc.deliverableId,
            deliverableType: "art_bible",
            metrics: {},
          };
        }
        throw new ExecutionError("DELIVERABLE_SAVE_FAILED", rpc.reason ?? "");
      }

      const deliverableId = rpc.deliverableId!;

      // No memory ids are claimed: this deliverable has no field for them.
      // Called anyway so the run is recorded as having had memories available
      // and used none, which is different from never having looked.
      await recordAppliedMemories(executionId, deliverableId, [], memories, supabase);

      return {
        deliverableId,
        deliverableType: "art_bible",
        metrics: { candidateCount: totalAssetCount(output) },
      };
    }
  },
};

/**
 * The checks that replace citation validation.
 *
 * Each one catches a way a bible can read well and be useless. All arithmetic
 * and string matching — no second model call to judge the first one, which
 * would cost money to produce an opinion nobody could audit.
 */
function findContradiction(bible: ArtBibleOutput): string | null {
  const hexes = new Set(bible.palette.map((entry) => entry.hex.toLowerCase()));

  // A rule about a colour that is not in the palette is a rule about nothing,
  // and it is the most common way this document quietly stops being a spec.
  for (const rule of bible.forbidden) {
    for (const hex of rule.rule.match(/#[0-9a-fA-F]{6}/g) ?? []) {
      if (!hexes.has(hex.toLowerCase())) {
        return `the rule "${rule.rule}" names ${hex}, which is not in the palette`;
      }
    }
  }

  // Two entries doing the same job means neither is the answer when somebody
  // asks which colour to use.
  const roles = bible.palette.map((entry) => entry.role.trim().toLowerCase());
  const duplicateRole = roles.find(
    (role, index) => roles.indexOf(role) !== index,
  );
  if (duplicateRole) {
    return `two palette entries both claim the role "${duplicateRole}"`;
  }

  const prefixes = bible.assetGroups.map((group) =>
    group.namePrefix.trim().toLowerCase(),
  );
  const duplicatePrefix = prefixes.find(
    (prefix, index) => prefixes.indexOf(prefix) !== index,
  );
  if (duplicatePrefix) {
    return `two asset groups share the filename prefix "${duplicatePrefix}", so their files cannot be told apart`;
  }

  // A group with states has at least one file per state. Fewer means the count
  // was written without looking at the list beside it.
  for (const group of bible.assetGroups) {
    if (group.variants.length > group.fileCount) {
      return `"${group.name}" lists ${group.variants.length} states but only ${group.fileCount} files`;
    }
  }

  const total = totalAssetCount(bible);
  if (total > MAX_TOTAL_ASSETS) {
    return `the asset list comes to ${total} files, which is a scope to discuss before it is a plan`;
  }

  // The template is what everything downstream actually uses. If it carries
  // none of the palette, the rest of the document is decoration.
  const templateHasColour = [...hexes].some((hex) =>
    bible.promptTemplate.toLowerCase().includes(hex),
  );
  if (!templateHasColour) {
    return "the prompt template does not name a single colour from the palette, so nothing generated from it would follow the bible";
  }

  return null;
}
