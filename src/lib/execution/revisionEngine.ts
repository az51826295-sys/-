import { createClient } from "@/lib/supabase/server";
import { defaultProviders, type Providers } from "@/lib/execution/engine";
import { loadRevisionContext, type RevisionWorkContext } from "@/lib/execution/revisionContext";
import {
  buildFeedbackAnalysisPrompt,
  buildRevisionPrompt,
  buildRevisionValidationPrompt,
} from "@/lib/execution/revisionPrompts";
import { validateAndRender, type CitableSource } from "@/lib/execution/citations";
import { recordPolicyFindings } from "@/lib/policies/validation";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import { normalizeUrl, domainOf } from "@/lib/research/url";
import { rankSources, scoreSources } from "@/lib/research/scoring";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import {
  feedbackAnalysisSchema,
  MAX_QUERY_LENGTH,
  MAX_RESULTS_PER_QUERY,
  MAX_REVISION_QUERIES,
  MAX_REVISION_SOURCES,
  MAX_SOURCE_CHARS,
  revisedDeliverableOutputSchema,
  revisionValidationSchema,
  type FeedbackAnalysis,
  type ResearchSourceForPrompt,
  type RevisedDeliverableOutput,
  type RevisionErrorCode,
  type RevisionStep,
} from "@/lib/execution/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

class RevisionError extends Error {
  constructor(
    readonly code: RevisionErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

async function setStep(supabase: Supabase, executionId: string, step: RevisionStep) {
  await supabase
    .from("work_executions")
    .update({ current_step: step, updated_at: new Date().toISOString() })
    .eq("id", executionId);
}

async function completeProgressEvent(
  supabase: Supabase,
  assignmentId: string,
  eventType: string,
) {
  await supabase
    .from("assignment_progress_events")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("assignment_id", assignmentId)
    .eq("event_type", eventType)
    .neq("status", "completed");
}

interface RevisionSource extends CitableSource {
  content: string;
}

/**
 * Runs one revision end to end: understand the feedback, gather only the extra
 * evidence it calls for, revise rather than rewrite, then refuse to submit
 * unless the result actually covers what was asked.
 */
export async function executeDeliverableRevision(
  executionId: string,
  providers: Providers = defaultProviders(),
): Promise<{ ok: true; deliverableId: string } | { ok: false; code: RevisionErrorCode }> {
  const supabase = await createClient();

  const { data: execution } = await supabase
    .from("work_executions")
    .select("*")
    .eq("id", executionId)
    .maybeSingle();

  if (!execution) return { ok: false, code: "REVISION_CONTEXT_INCOMPLETE" };

  // A revision costs as much as the original. The manager asking for changes
  // is not a reason to spend past the allowance.
  const blocked = await blockedBySpendLimit(supabase, execution.company_id);
  if (blocked) {
    await supabase.rpc("fail_revision_execution", {
      p_execution_id: executionId,
      p_error_code: "REVISION_CONTEXT_INCOMPLETE",
      p_error_message: blocked,
    });
    return { ok: false, code: "REVISION_CONTEXT_INCOMPLETE" };
  }

  try {
    const now = new Date().toISOString();

    await supabase
      .from("work_executions")
      .update({
        status: "running",
        started_at: now,
        model_provider: providers.ai.name,
        model_name: providers.ai.model,
      })
      .eq("id", executionId);

    await supabase
      .from("revision_requests")
      .update({ status: "in_progress", started_at: now, updated_at: now })
      .eq("id", execution.revision_request_id);

    await supabase
      .from("assignments")
      .update({ status: "revising", updated_at: now })
      .eq("id", execution.assignment_id);

    const context = await loadContextOrFail(supabase, executionId);
    const analysis = await analyzeManagerFeedback(
      supabase,
      executionId,
      providers,
      context,
      execution.revision_request_id,
    );
    const sources = await collectSources(
      supabase,
      executionId,
      providers,
      context,
      analysis,
      execution,
    );
    const deliverableId = await reviseAndSubmit(
      supabase,
      executionId,
      providers,
      context,
      analysis,
      sources,
    );

    // A revision is held to the standard the assignment started under, not to
    // whatever the policy says today — otherwise a manager could ask for
    // changes and get back work judged by a rule the first version never saw.
    try {
      await recordPolicyFindings(
        supabase,
        execution.company_id,
        execution.assignment_id,
        deliverableId,
      );
    } catch {
      // The revision stands.
    }

    return { ok: true, deliverableId };
  } catch (error) {
    const code =
      error instanceof RevisionError ? error.code : ("MODEL_REVISION_FAILED" as const);
    const message = error instanceof Error ? error.message : String(error);

    await supabase.rpc("fail_revision_execution", {
      p_execution_id: executionId,
      p_error_code: code,
      p_error_message: message.slice(0, 500),
    });

    return { ok: false, code };
  }
}

async function loadContextOrFail(
  supabase: Supabase,
  executionId: string,
): Promise<RevisionWorkContext> {
  await setStep(supabase, executionId, "revision_context_loaded");

  const result = await loadRevisionContext(executionId);
  if (!result.ok) {
    throw new RevisionError(
      "REVISION_CONTEXT_INCOMPLETE",
      `missing: ${result.missing.join(", ")}`,
    );
  }

  await supabase
    .from("work_executions")
    .update({
      input_snapshot: {
        capturedAt: new Date().toISOString(),
        employee: result.context.base.employee,
        company: result.context.base.company,
        companyKnowledge: result.context.base.companyKnowledge,
        assignment: result.context.base.assignment,
        previousDeliverableId: result.context.previousDeliverable.id,
        previousVersion: result.context.previousDeliverable.version,
        managerFeedback: result.context.managerFeedback.feedback,
      },
    })
    .eq("id", executionId);

  return result.context;
}

async function analyzeManagerFeedback(
  supabase: Supabase,
  executionId: string,
  providers: Providers,
  context: RevisionWorkContext,
  revisionRequestId: string,
): Promise<FeedbackAnalysis> {
  await setStep(supabase, executionId, "feedback_analyzing");

  // An earlier attempt at this same revision may have already worked out the
  // plan before failing further along. The feedback hasn't changed, so
  // re-deriving it would spend a large model call to reach the same answer.
  const { data: earlier } = await supabase
    .from("work_executions")
    .select("feedback_analysis_json")
    .eq("revision_request_id", revisionRequestId)
    .not("feedback_analysis_json", "is", null)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (earlier?.feedback_analysis_json) {
    const reused = earlier.feedback_analysis_json as FeedbackAnalysis;

    await supabase
      .from("work_executions")
      .update({ feedback_analysis_json: reused })
      .eq("id", executionId);

    await setStep(supabase, executionId, "revision_planning");
    await completeProgressEvent(
      supabase,
      context.base.assignment.id,
      "revision_plan_created",
    );

    return reused;
  }

  const { system, input } = buildFeedbackAnalysisPrompt(context);

  let analysis: FeedbackAnalysis;
  try {
    const result = await providers.ai.generateStructuredOutput({
      systemInstructions: system,
      input,
      schema: feedbackAnalysisSchema,
      schemaName: "feedback_analysis",
      // Reads the whole previous deliverable, so it thinks a lot before
      // producing a fairly small plan.
      maxTokens: 24000,
    });
    analysis = result.output;
  } catch (error) {
    throw new RevisionError(
      "FEEDBACK_ANALYSIS_FAILED",
      error instanceof Error ? error.message : undefined,
    );
  }

  if (analysis.requiredChanges.length === 0) {
    throw new RevisionError("FEEDBACK_ANALYSIS_FAILED", "no required changes identified");
  }

  const trimmed: FeedbackAnalysis = {
    ...analysis,
    searchQueries: analysis.searchQueries
      .map((query) => query.trim())
      .filter((query) => query.length > 0 && query.length <= MAX_QUERY_LENGTH)
      .slice(0, MAX_REVISION_QUERIES),
  };

  await supabase
    .from("work_executions")
    .update({ feedback_analysis_json: trimmed })
    .eq("id", executionId);

  await setStep(supabase, executionId, "revision_planning");
  await completeProgressEvent(
    supabase,
    context.base.assignment.id,
    "revision_plan_created",
  );

  return trimmed;
}

async function collectSources(
  supabase: Supabase,
  executionId: string,
  providers: Providers,
  context: RevisionWorkContext,
  analysis: FeedbackAnalysis,
  execution: {
    company_id: string;
    assignment_id: string;
    revision_request_id: string;
  },
): Promise<RevisionSource[]> {
  // Everything the first run gathered carries forward; the revision only tops up.
  const reused: RevisionSource[] = context.existingSources.map((source) => ({
    id: source.id,
    title: source.title,
    url: source.url,
    domain: domainOf(source.url),
    publishedAt: source.publishedAt,
    accessedAt: null,
    fetchStatus: source.fetchStatus,
    content: source.content,
  }));

  for (const source of reused) {
    await supabase
      .from("work_execution_sources")
      .upsert(
        {
          work_execution_id: executionId,
          research_source_id: source.id,
          usage_type: "reused",
        },
        { onConflict: "work_execution_id,research_source_id" },
      );
  }

  // An earlier attempt at this revision may already have run the searches; its
  // finds are in `reused` now, so searching again would pay for the same pages
  // twice and push the context wider each time.
  const { data: alreadySearched } = await supabase
    .from("work_executions")
    .select("id")
    .eq("revision_request_id", execution.revision_request_id)
    .gt("search_request_count", 0)
    .limit(1)
    .maybeSingle();

  const needsResearch =
    analysis.additionalResearchRequired &&
    analysis.searchQueries.length > 0 &&
    !alreadySearched;

  if (!needsResearch) {
    if (reused.length === 0) {
      throw new RevisionError("REVISION_RESEARCH_FAILED", "no sources available to revise from");
    }
    return reused;
  }

  await setStep(supabase, executionId, "additional_research");

  const known = new Set(context.existingSources.map((source) => source.normalizedUrl));
  const candidates = [];
  let searchCount = 0;

  for (const query of analysis.searchQueries) {
    try {
      const results = await providers.search.search(query, MAX_RESULTS_PER_QUERY);
      searchCount += 1;
      for (const result of results) {
        const normalized = normalizeUrl(result.url);
        // Never re-store a page the assignment already has.
        if (known.has(normalized)) continue;
        known.add(normalized);
        candidates.push(result);
      }
    } catch {
      // One dead query does not sink the revision; the reused sources remain.
    }
  }

  const ranked = rankSources(
    scoreSources(candidates, {
      assignmentTitle: context.base.assignment.title,
      assignmentDescription: context.base.assignment.description,
      companyName: context.base.company.name,
      competitors: context.base.companyKnowledge.competitors ?? [],
      companyWebsite: context.base.company.website,
    }),
  ).slice(0, MAX_REVISION_SOURCES);

  const added: RevisionSource[] = [];

  for (const scored of ranked) {
    const result = scored.result;
    const accessedAt = new Date().toISOString();

    let content = result.rawContent ?? "";
    let fetchStatus: string = content ? "fetched" : "discovered";

    if (!content) {
      try {
        const fetched = await providers.fetcher.fetch(result.url);
        content = fetched.text;
        fetchStatus = content ? "fetched" : "failed";
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        fetchStatus = message.startsWith("BLOCKED_") ? "blocked" : "failed";
      }
    }

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
        normalized_url: normalizeUrl(result.url),
        domain: domainOf(result.url),
        source_type: scored.sourceType,
        snippet: result.snippet ?? null,
        content_text: usableContent,
        published_at: result.publishedAt ?? null,
        accessed_at: accessedAt,
        fetch_status: fetchStatus,
        relevance_score: scored.relevanceScore,
        trust_score: scored.trustScore,
        selected_for_deliverable: true,
      })
      .select("id")
      .single();

    if (!inserted) continue;

    await supabase.from("work_execution_sources").insert({
      work_execution_id: executionId,
      research_source_id: inserted.id,
      usage_type: "selected",
    });

    added.push({
      id: inserted.id as string,
      title: result.title,
      url: result.url,
      domain: domainOf(result.url),
      publishedAt: result.publishedAt ?? null,
      accessedAt,
      fetchStatus,
      content: usableContent,
    });
  }

  await supabase
    .from("work_executions")
    .update({
      search_request_count: searchCount,
      source_fetch_count: reused.length + added.length,
    })
    .eq("id", executionId);

  await completeProgressEvent(
    supabase,
    context.base.assignment.id,
    "additional_evidence_reviewed",
  );

  if (reused.length + added.length === 0) {
    throw new RevisionError("REVISION_RESEARCH_FAILED");
  }

  return [...reused, ...added];
}

async function reviseAndSubmit(
  supabase: Supabase,
  executionId: string,
  providers: Providers,
  context: RevisionWorkContext,
  analysis: FeedbackAnalysis,
  sources: RevisionSource[],
): Promise<string> {
  const promptSources: ResearchSourceForPrompt[] = sources.map((source) => ({
    id: source.id,
    title: source.title,
    url: source.url,
    publishedAt: source.publishedAt ?? undefined,
    fetchStatus: source.fetchStatus,
    content: source.content,
  }));

  const definition = getEmployeeDefinition(context.base.employee.slug);

  let citationFailure = "";
  let missingChanges: string[] = [];

  // Two attempts: the second gets told exactly what it missed. Beyond that the
  // revision fails rather than shipping something that ignores the manager.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await setStep(supabase, executionId, "revision_drafting");

    const { system, input } = buildRevisionPrompt(
      context,
      analysis,
      promptSources,
      attempt === 0 ? undefined : { missingChanges },
    );

    let revised: RevisedDeliverableOutput;
    try {
      const result = await providers.ai.generateStructuredOutput({
        systemInstructions: system,
        input,
        schema: revisedDeliverableOutputSchema,
        schemaName: "revised_deliverable",
        // A revision carries the previous deliverable forward and adds to it,
        // so it needs more room than the first draft did.
        maxTokens: 64000,
      });
      revised = result.output;
    } catch (error) {
      throw new RevisionError(
        "MODEL_REVISION_FAILED",
        error instanceof Error ? error.message : undefined,
      );
    }

    // A revision that cannot say what it changed is not a revision.
    if (revised.revisionSummary.length === 0) {
      citationFailure = "the revised deliverable does not describe what changed";
      missingChanges = ["Describe what changed in this revision."];
      continue;
    }

    await setStep(supabase, executionId, "citation_validation");

    const check = validateAndRender(revised, sources, context.base.employee.name);
    if (!check.ok) {
      citationFailure = check.reason;
      missingChanges = [
        `Cite only the source ids provided, and give every factual claim a citation (${check.reason}).`,
      ];
      continue;
    }

    await setStep(supabase, executionId, "feedback_validation");

    const validation = await validateAgainstFeedback(providers, context, analysis, revised);

    await supabase
      .from("work_executions")
      .update({ revision_validation_json: validation })
      .eq("id", executionId);

    if (!validation.passed) {
      missingChanges = validation.missingChanges;
      citationFailure = `missing requested changes: ${validation.missingChanges.join("; ")}`;
      continue;
    }

    await completeProgressEvent(
      supabase,
      context.base.assignment.id,
      "requested_changes_checked",
    );

    await setStep(supabase, executionId, "resubmitting");

    for (const citation of check.citations) {
      await supabase
        .from("work_execution_sources")
        .upsert(
          {
            work_execution_id: executionId,
            research_source_id: citation.sourceId,
            usage_type: "cited",
          },
          { onConflict: "work_execution_id,research_source_id" },
        );
    }

    const { data, error } = await supabase.rpc("submit_revised_deliverable", {
      p_execution_id: executionId,
      p_title: revised.title,
      p_deliverable_type: definition?.deliverable.type ?? "market_research_report",
      p_content_markdown: check.markdown,
      p_content_json: revised,
      p_revision_summary_json: revised.revisionSummary,
      p_generation_model: providers.ai.model,
      p_citations: check.citations,
    });

    if (error) {
      throw new RevisionError("REVISION_SAVE_FAILED", error.message);
    }

    const rpc = data as { ok: boolean; reason?: string; deliverableId?: string };
    if (!rpc.ok) {
      if (rpc.reason === "already_submitted" && rpc.deliverableId) {
        return rpc.deliverableId;
      }
      throw new RevisionError("REVISION_SAVE_FAILED", rpc.reason);
    }

    return rpc.deliverableId!;
  }

  // Distinguish "we couldn't evidence it" from "we ignored the manager".
  throw new RevisionError(
    missingChanges.length > 0 && !citationFailure.startsWith("Cite only")
      ? "REVISION_INCOMPLETE"
      : "REVISION_CITATION_FAILED",
    citationFailure,
  );
}

async function validateAgainstFeedback(
  providers: Providers,
  context: RevisionWorkContext,
  analysis: FeedbackAnalysis,
  revised: RevisedDeliverableOutput,
) {
  const { system, input } = buildRevisionValidationPrompt(context, analysis, revised);

  try {
    const result = await providers.ai.generateStructuredOutput({
      systemInstructions: system,
      input,
      schema: revisionValidationSchema,
      schemaName: "revision_validation",
      maxTokens: 16000,
    });
    return result.output;
  } catch (error) {
    // The checker breaking is not the same as the revision being wrong. Redrafting
    // would burn another long generation against a verdict nobody reached, so
    // this is surfaced as its own failure and left for a cheap retry.
    throw new RevisionError(
      "REVISION_CHECK_UNAVAILABLE",
      error instanceof Error ? error.message : undefined,
    );
  }
}
