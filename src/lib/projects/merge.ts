import type { SupabaseClient } from "@supabase/supabase-js";
import type { Providers } from "@/lib/execution/shared";
import {
  buildMergePrompt,
  renderProjectBrief,
  type ContributionForMerge,
} from "@/lib/projects/prompts";
import { projectBriefSchema, type WorkItemSummary } from "@/lib/projects/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

/**
 * Writes the one thing the manager reads.
 *
 * Lives in the deliverables table like any other result, so it inherits review,
 * feedback and versioning rather than reimplementing them — the manager
 * approves a project brief with the same actions they approve a report with.
 */
export async function prepareProjectDeliverable(
  db: Db,
  projectId: string,
  providers: Providers,
  options: { mergeInstructions?: string; supersedes?: string } = {},
): Promise<{ ok: true; deliverableId: string } | { ok: false }> {
  const { data: project } = await db
    .from("projects")
    .select("*, companies(name)")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return { ok: false };

  const companyName =
    (project as unknown as { companies: { name: string } | null }).companies?.name ??
    "the company";

  const { data: itemRows } = await db
    .from("project_work_items")
    .select(
      "id, title, objective, status, latest_deliverable_id, required_for_project_completion, company_employees(employees(name, role))",
    )
    .eq("project_id", projectId)
    .order("sequence_order", { ascending: true });

  const items = (itemRows ?? []) as unknown as {
    id: string;
    title: string;
    objective: string;
    status: string;
    latest_deliverable_id: string | null;
    required_for_project_completion: boolean;
    company_employees: { employees: { name: string; role: string } } | null;
  }[];

  const contributions: ContributionForMerge[] = [];
  const citationIds = new Set<string>();
  const sourceLinks: { deliverableId: string; researchSourceId: string }[] = [];
  const unfinished: string[] = [];

  for (const item of items) {
    const name = item.company_employees?.employees?.name ?? "An employee";
    const role = item.company_employees?.employees?.role ?? "";

    if (item.status !== "completed" || !item.latest_deliverable_id) {
      unfinished.push(`${item.title} (${name}) — ${item.status}`);
      continue;
    }

    const { data: summaryRow } = await db
      .from("project_work_item_summaries")
      .select("summary_json")
      .eq("project_work_item_id", item.id)
      .eq("deliverable_id", item.latest_deliverable_id)
      .maybeSingle();

    const summary = summaryRow?.summary_json as WorkItemSummary | undefined;

    // A missing summary is a degraded contribution, not a lost one — fall back
    // to the deliverable's own executive summary rather than dropping the
    // employee's work from the brief entirely.
    const fallback = await fallbackSummary(db, item.latest_deliverable_id);

    contributions.push({
      workItemId: item.id,
      employeeName: name,
      employeeRole: role,
      workItemTitle: item.title,
      summary: summary ?? {
        objective: item.objective,
        completedOutcome: fallback,
        keyFindings: [],
        recommendations: [],
        citationIds: [],
      },
    });

    const { data: sources } = await db
      .from("deliverable_sources")
      .select("research_sources(id)")
      .eq("deliverable_id", item.latest_deliverable_id);

    for (const row of (sources ?? []) as unknown as {
      research_sources: { id: string } | null;
    }[]) {
      const id = row.research_sources?.id;
      if (!id) continue;
      citationIds.add(id);
      sourceLinks.push({
        deliverableId: item.latest_deliverable_id,
        researchSourceId: id,
      });
    }
  }

  if (contributions.length === 0) return { ok: false };

  const planSections =
    (project.plan_json as { finalDeliverable?: { sections?: string[] } } | null)
      ?.finalDeliverable?.sections ?? [];

  const { system, input } = buildMergePrompt(
    project.goal as string,
    (project.expected_outcome as string) ?? "",
    companyName,
    planSections,
    contributions,
    unfinished,
    [...citationIds],
    options.mergeInstructions,
  );

  let brief;
  try {
    const result = await providers.ai.generateStructuredOutput({
      systemInstructions: system,
      input,
      schema: projectBriefSchema,
      schemaName: "project_brief",
      maxTokens: 32000,
    });
    brief = result.output;
  } catch {
    return { ok: false };
  }

  // Citations checked against what the team actually gathered. The model is
  // asked not to invent ids; this is what makes that true rather than hoped for.
  const allowed = citationIds;
  const cited = new Set<string>();

  const cleaned = {
    ...brief,
    keyFindings: brief.keyFindings.map((finding) => ({
      ...finding,
      citationIds: finding.citationIds.filter((id) => {
        if (!allowed.has(id)) return false;
        cited.add(id);
        return true;
      }),
    })),
    recommendations: brief.recommendations.map((recommendation) => ({
      ...recommendation,
      citationIds: recommendation.citationIds.filter((id) => {
        if (!allowed.has(id)) return false;
        cited.add(id);
        return true;
      }),
    })),
  };

  const { data: latest } = await db
    .from("deliverables")
    .select("version")
    .eq("project_id", projectId)
    .eq("deliverable_scope", "project")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = ((latest?.version as number | undefined) ?? 0) + 1;

  const { data: inserted } = await db
    .from("deliverables")
    .insert({
      company_id: project.company_id,
      project_id: projectId,
      deliverable_scope: "project",
      deliverable_type: "project_brief",
      title: cleaned.title.slice(0, 200),
      content_markdown: renderProjectBrief(cleaned),
      content_json: cleaned as never,
      status: "submitted",
      version,
      parent_deliverable_id: options.supersedes ?? null,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (!inserted) return { ok: false };

  const deliverableId = inserted.id as string;

  // Only what the brief actually cited, plus what it inherited. The manager's
  // source list should reflect the document in front of them.
  const seen = new Set<string>();
  for (const link of sourceLinks) {
    if (seen.has(link.researchSourceId)) continue;
    seen.add(link.researchSourceId);

    await db.from("project_deliverable_sources").insert({
      company_id: project.company_id,
      project_id: projectId,
      project_deliverable_id: deliverableId,
      source_deliverable_id: link.deliverableId,
      research_source_id: link.researchSourceId,
      usage_type: cited.has(link.researchSourceId) ? "cited" : "inherited",
    });
  }

  if (options.supersedes) {
    await db
      .from("deliverables")
      .update({ status: "superseded" })
      .eq("id", options.supersedes);
  }

  return { ok: true, deliverableId };
}

async function fallbackSummary(db: Db, deliverableId: string): Promise<string> {
  const { data } = await db
    .from("deliverables")
    .select("content_json, title")
    .eq("id", deliverableId)
    .maybeSingle();

  const content = data?.content_json as { executiveSummary?: string } | null;
  return content?.executiveSummary ?? (data?.title as string) ?? "";
}
