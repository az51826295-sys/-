import type { SupabaseClient } from "@supabase/supabase-js";
import type { Providers } from "@/lib/execution/shared";
import { buildSummaryPrompt } from "@/lib/projects/prompts";
import { workItemSummarySchema, type WorkItemSummary } from "@/lib/projects/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

const MAX_MARKDOWN_CHARS = 20_000;

/**
 * Reduces one finished contribution to what a colleague and the merge need.
 *
 * Returns null rather than throwing when it fails: a project should not be lost
 * because one summary call did. The merge falls back to reading the deliverable
 * itself, and a dependent work item is handed less than it might have been —
 * both degraded, neither fatal.
 */
export async function summarizeWorkItem(
  db: Db,
  providers: Providers,
  input: {
    companyId: string;
    projectId: string;
    workItemId: string;
    objective: string;
    deliverableId: string;
    deliverableMarkdown: string;
  },
): Promise<WorkItemSummary | null> {
  // Only ids that exist on this deliverable may be cited onward — the merge
  // inherits them, so a fabricated id here would end up in the manager's brief
  // looking like evidence.
  const { data: sourceRows } = await db
    .from("deliverable_sources")
    .select("research_sources(id)")
    .eq("deliverable_id", input.deliverableId);

  const citationIds = ((sourceRows ?? []) as unknown as {
    research_sources: { id: string } | null;
  }[])
    .map((row) => row.research_sources?.id)
    .filter((id): id is string => Boolean(id));

  const { system, input: prompt } = buildSummaryPrompt(
    input.objective,
    input.deliverableMarkdown.slice(0, MAX_MARKDOWN_CHARS),
    citationIds,
  );

  let summary: WorkItemSummary;
  try {
    const result = await providers.ai.generateStructuredOutput({
      systemInstructions: system,
      input: prompt,
      schema: workItemSummarySchema,
      schemaName: "work_item_summary",
      maxTokens: 8000,
    });
    summary = result.output;
  } catch {
    return null;
  }

  const allowed = new Set(citationIds);
  const cleaned: WorkItemSummary = {
    ...summary,
    citationIds: summary.citationIds.filter((id) => allowed.has(id)),
  };

  await db.from("project_work_item_summaries").upsert(
    {
      company_id: input.companyId,
      project_id: input.projectId,
      project_work_item_id: input.workItemId,
      deliverable_id: input.deliverableId,
      summary_json: cleaned as never,
    },
    { onConflict: "project_work_item_id,deliverable_id" },
  );

  return cleaned;
}
