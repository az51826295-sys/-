import type { SearchResult } from "@/lib/providers/types";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import type { EmployeeWorkContextV5 } from "@/lib/execution/context";
import { buildDeliverablePrompt, buildResearchPlanPrompt } from "@/lib/execution/prompts";
import { validateAndRender, type CitableSource } from "@/lib/execution/citations";
import {
  ExecutionError,
  setStep,
  type Providers,
  type Supabase,
} from "@/lib/execution/shared";
import { recordAppliedMemories } from "@/lib/memory/retrieval";
import { maybeCollaborate } from "@/lib/collaboration/engine";
import { normalizeUrl, domainOf } from "@/lib/research/url";
import { rankSources, scoreSources } from "@/lib/research/scoring";
import {
  deliverableOutputSchema,
  MAX_CANDIDATE_SOURCES,
  MAX_QUERY_LENGTH,
  MAX_QUESTIONS,
  MAX_RESULTS_PER_QUERY,
  MAX_SEARCH_QUERIES,
  MAX_SELECTED_SOURCES,
  MAX_SOURCE_CHARS,
  MIN_SEARCH_QUERIES,
  researchPlanSchema,
  type DeliverableOutput,
  type ResearchPlan,
  type ResearchSourceForPrompt,
} from "@/lib/execution/types";
import type {
  EmployeeSkill,
  SkillExecutionResult,
  SkillRunContext,
} from "@/lib/skills/types";

/**
 * How a market research analyst works: plan the questions, gather sources,
 * write the report, and refuse to publish it if the citations don't check out.
 *
 * This is Alex's skill, but nothing here names Alex — it is selected by the
 * skillId on the employee definition.
 */

async function createResearchPlan(
  supabase: Supabase,
  executionId: string,
  providers: Providers,
  context: EmployeeWorkContextV5,
): Promise<ResearchPlan> {
  await setStep(supabase, executionId, "research_planning");

  const { system, input } = buildResearchPlanPrompt(context);

  let plan: ResearchPlan;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const result = await providers.ai.generateStructuredOutput({
      systemInstructions: system,
      input,
      schema: researchPlanSchema,
      schemaName: "research_plan",
      maxTokens: 16000,
    });
    plan = result.output;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  } catch (error) {
    throw new ExecutionError(
      "MODEL_PLAN_FAILED",
      error instanceof Error ? error.message : undefined,
    );
  }

  // Trim rather than trust: the model can over-produce queries, and each one
  // costs a search request.
  const searchQueries = plan.searchQueries
    .map((query) => query.trim())
    .filter((query) => query.length > 0 && query.length <= MAX_QUERY_LENGTH)
    .slice(0, MAX_SEARCH_QUERIES);

  if (searchQueries.length < MIN_SEARCH_QUERIES) {
    throw new ExecutionError("INVALID_RESEARCH_PLAN", "too few usable queries");
  }

  const trimmed: ResearchPlan = {
    objective: plan.objective.trim(),
    questions: plan.questions.slice(0, MAX_QUESTIONS),
    searchQueries,
    preferredSourceTypes: plan.preferredSourceTypes,
  };

  await supabase
    .from("work_executions")
    .update({
      research_plan_json: trimmed,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    })
    .eq("id", executionId);

  return trimmed;
}

interface StoredSource extends CitableSource {
  content: string;
}

async function collectResearchSources(
  supabase: Supabase,
  executionId: string,
  providers: Providers,
  context: EmployeeWorkContextV5,
  plan: ResearchPlan,
  execution: { company_id: string; assignment_id: string },
): Promise<{ sources: StoredSource[]; searchCount: number }> {
  await setStep(supabase, executionId, "searching");

  const seen = new Set<string>();
  const candidates: SearchResult[] = [];
  let searchCount = 0;
  let searchFailures = 0;

  for (const query of plan.searchQueries) {
    if (candidates.length >= MAX_CANDIDATE_SOURCES) break;
    try {
      const results = await providers.search.search(query, MAX_RESULTS_PER_QUERY);
      searchCount += 1;
      for (const result of results) {
        const normalized = normalizeUrl(result.url);
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        candidates.push(result);
        if (candidates.length >= MAX_CANDIDATE_SOURCES) break;
      }
    } catch {
      searchFailures += 1;
    }
  }

  if (searchCount === 0 && searchFailures > 0) {
    throw new ExecutionError("SEARCH_FAILED", "every search request failed");
  }
  if (candidates.length === 0) {
    throw new ExecutionError("NO_RELEVANT_SOURCES");
  }

  const ranked = rankSources(
    scoreSources(candidates, {
      assignmentTitle: context.assignment.title,
      assignmentDescription: context.assignment.description,
      companyName: context.company.name,
      competitors: context.companyKnowledge.competitors ?? [],
      companyWebsite: context.company.website,
    }),
  ).slice(0, MAX_SELECTED_SOURCES);

  await setStep(supabase, executionId, "fetching_sources");

  const stored: StoredSource[] = [];

  for (const scored of ranked) {
    const result = scored.result;
    const normalized = normalizeUrl(result.url);
    const accessedAt = new Date().toISOString();

    let content = result.rawContent ?? "";
    let fetchStatus: string = content ? "fetched" : "discovered";
    let author: string | undefined;
    let publishedAt = result.publishedAt;

    if (!content) {
      try {
        const fetched = await providers.fetcher.fetch(result.url);
        content = fetched.text;
        author = fetched.author;
        publishedAt = fetched.publishedAt ?? publishedAt;
        fetchStatus = content ? "fetched" : "failed";
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        fetchStatus = message.startsWith("BLOCKED_") ? "blocked" : "failed";
      }
    }

    // Snippet-only sources still go in, flagged, so the model can use them as
    // weak evidence rather than us dropping the finding entirely.
    const usableContent = content.slice(0, MAX_SOURCE_CHARS) || (result.snippet ?? "");
    if (!usableContent.trim()) continue;

    const { data: inserted } = await supabase
      .from("research_sources")
      .insert({
        company_id: execution.company_id,
        assignment_id: execution.assignment_id,
        work_execution_id: executionId,
        title: result.title,
        url: result.url,
        normalized_url: normalized,
        domain: domainOf(result.url),
        source_type: scored.sourceType,
        snippet: result.snippet ?? null,
        content_text: usableContent,
        author: author ?? null,
        published_at: publishedAt ?? null,
        accessed_at: accessedAt,
        fetch_status: fetchStatus,
        relevance_score: scored.relevanceScore,
        trust_score: scored.trustScore,
        selected_for_deliverable: true,
      })
      .select("id")
      .single();

    if (!inserted) continue;

    stored.push({
      id: inserted.id as string,
      title: result.title,
      url: result.url,
      domain: domainOf(result.url),
      publishedAt: publishedAt ?? null,
      accessedAt,
      fetchStatus,
      content: usableContent,
    });
  }

  // Counts the sources actually reviewed, not the HTTP requests made — the
  // search provider often supplies body text, so a fetch count would
  // under-report what the employee actually read.
  await supabase
    .from("work_executions")
    .update({ search_request_count: searchCount, source_fetch_count: stored.length })
    .eq("id", executionId);

  if (stored.length === 0) {
    throw new ExecutionError("NO_RELEVANT_SOURCES");
  }

  return { sources: stored, searchCount };
}

/** Enough for the employee to judge whether they need a colleague, without
 *  pasting the whole research pass into a second prompt. */
function summarizeFindings(plan: ResearchPlan, sources: StoredSource[]): string {
  return [
    `Objective: ${plan.objective}`,
    "",
    `You have read ${sources.length} sources:`,
    ...sources.slice(0, 15).map((source) => `- ${source.title} (${source.domain})`),
  ].join("\n");
}

async function generateAndSubmit(
  ctx: SkillRunContext,
  plan: ResearchPlan,
  sources: StoredSource[],
): Promise<string> {
  const { supabase, executionId, providers, context, memories, history } = ctx;

  await setStep(supabase, executionId, "analyzing");

  const promptSources: ResearchSourceForPrompt[] = sources.map((source) => ({
    id: source.id,
    title: source.title,
    url: source.url,
    publishedAt: source.publishedAt ?? undefined,
    fetchStatus: source.fetchStatus,
    content: source.content,
  }));

  // Asked after the research and before the writing: the employee can only
  // judge whether they need a colleague once they know what they actually
  // found, and a colleague's result is only useful if it arrives before the
  // draft rather than after it.
  const collaboration = await maybeCollaborate(
    supabase,
    executionId,
    providers,
    context,
    ctx.execution,
    summarizeFindings(plan, sources),
    ctx.runChildAssignment,
  );

  await setStep(supabase, executionId, "drafting");

  const definition = getEmployeeDefinition(context.employee.slug);
  const { system, input } = buildDeliverablePrompt(
    context,
    promptSources,
    plan.objective,
    undefined,
    memories,
    history,
    collaboration,
  );

  let citationFailure = "";

  // One regeneration on a citation failure, then give up rather than publish a
  // deliverable whose evidence doesn't check out.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let generated: DeliverableOutput;
    try {
      const result = await providers.ai.generateStructuredOutput({
        systemInstructions:
          attempt === 0
            ? system
            : `${system}\n\n## Correction\n\nYour previous attempt was rejected: ${citationFailure}. Cite only the source ids listed below, and give every factual claim a citation.`,
        input,
        schema: deliverableOutputSchema,
        schemaName: "deliverable",
        maxTokens: 32000,
      });
      generated = result.output;
    } catch (error) {
      throw new ExecutionError(
        "MODEL_DELIVERABLE_FAILED",
        error instanceof Error ? error.message : undefined,
      );
    }

    await setStep(supabase, executionId, "validating_citations");

    const check = validateAndRender(generated, sources, context.employee.name);
    if (check.ok) {
      await setStep(supabase, executionId, "submitting");

      const { data, error } = await supabase.rpc("submit_generated_deliverable", {
        p_execution_id: executionId,
        p_title: generated.title,
        p_deliverable_type: definition?.deliverable.type ?? "market_research_report",
        p_content_markdown: check.markdown,
        p_content_json: generated,
        p_generation_model: providers.ai.model,
        p_citations: check.citations,
      });

      if (error) {
        throw new ExecutionError("DELIVERABLE_SAVE_FAILED", error.message);
      }

      const rpc = data as { ok: boolean; reason?: string; deliverableId?: string };
      if (!rpc.ok) {
        if (rpc.reason === "already_submitted" && rpc.deliverableId) {
          return rpc.deliverableId;
        }
        throw new ExecutionError("DELIVERABLE_SAVE_FAILED", rpc.reason);
      }

      // Bookkeeping only: the deliverable is already saved, so a problem here
      // must not turn finished work into a failed run.
      try {
        await recordAppliedMemories(
          executionId,
          rpc.deliverableId!,
          generated.appliedMemoryIds ?? [],
          memories,
          supabase,
        );
      } catch {
        // Left unrecorded; the deliverable stands.
      }

      return rpc.deliverableId!;
    }

    citationFailure = check.reason;
  }

  throw new ExecutionError("CITATION_VALIDATION_FAILED", citationFailure);
}

export const marketResearchSkill: EmployeeSkill = {
  id: "market_research",
  deliverableType: "market_research_report",

  capabilities: [
    {
      id: "competitor_analysis",
      label: "Analyse how specific competitors are positioned and priced",
      produces: "A sourced write-up of what those competitors do and charge",
    },
    {
      id: "market_context",
      label: "Establish what is currently true about a market",
      produces: "A sourced summary of the market and what has recently changed",
    },
  ],
  acceptsInternalRequests: true,

  async run(ctx: SkillRunContext): Promise<SkillExecutionResult> {
    const plan = await createResearchPlan(
      ctx.supabase,
      ctx.executionId,
      ctx.providers,
      ctx.context,
    );

    const { sources, searchCount } = await collectResearchSources(
      ctx.supabase,
      ctx.executionId,
      ctx.providers,
      ctx.context,
      plan,
      ctx.execution,
    );

    const deliverableId = await generateAndSubmit(ctx, plan, sources);

    return {
      deliverableId,
      deliverableType: "market_research_report",
      metrics: { searchCount, sourceCount: sources.length },
    };
  },
};
