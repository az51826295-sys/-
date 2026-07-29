import { createClient } from "@/lib/supabase/server";
import { defaultProviders, type Providers } from "@/lib/execution/engine";
import { loadLearningContext, type LearningContext } from "@/lib/memory/context";
import { buildLearningPrompt } from "@/lib/memory/prompts";
import { meterProviders } from "@/lib/costs/meter";
import { proposeOrganizationLearning } from "@/lib/knowledge/candidates";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import {
  KNOWLEDGE_SUMMARY_HARD_MAX,
  KNOWLEDGE_TITLE_HARD_MAX,
  MAX_ORGANIZATION_CANDIDATES,
  type OrganizationCandidate,
} from "@/lib/knowledge/types";
import {
  DUPLICATE_THRESHOLD,
  similarity,
  validateCandidate,
} from "@/lib/memory/validation";
import {
  CANDIDATE_CAPS,
  learningOutputSchema,
  MAX_CANDIDATES,
  VALIDITY_DAYS,
  type CandidateDecision,
  type ConflictType,
  type LearningErrorCode,
  type MemoryCandidate,
  type MemoryCategory,
} from "@/lib/memory/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

class LearningError extends Error {
  constructor(
    readonly code: LearningErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/**
 * Turns one approved deliverable into durable lessons. Runs after approval and
 * entirely separate from it: if this fails, the work stays approved and the
 * employee stays ready — only the learning is missing, and it can be retried.
 */
export async function learnFromApprovedDeliverable(
  learningSessionId: string,
  providers: Providers = defaultProviders(),
): Promise<{ ok: true; accepted: number } | { ok: false; code: LearningErrorCode }> {
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("employee_learning_sessions")
    .select("*")
    .eq("id", learningSessionId)
    .maybeSingle();

  if (!session) return { ok: false, code: "LEARNING_CONTEXT_INCOMPLETE" };

  try {
    await supabase
      .from("employee_learning_sessions")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", learningSessionId);

    const context = await loadContextOrFail(
      supabase,
      learningSessionId,
      session.deliverable_id,
    );
    const blocked = await blockedBySpendLimit(supabase, context.companyId);
    if (blocked) throw new LearningError("LEARNING_EXTRACTION_FAILED", blocked);

    const candidates = await extractCandidates(
      meterProviders(providers, supabase, {
        companyId: context.companyId,
        companyEmployeeId: context.companyEmployeeId,
      }),
      context,
    );
    const result = await persistCandidates(
      supabase,
      learningSessionId,
      context,
      candidates.memories,
    );

    // Proposals for the company, not decisions about it. Recorded as pending
    // and swallowed on failure: an employee's own learning must not be lost
    // because a company-level proposal could not be written down.
    try {
      await proposeOrganizationLearning(
        supabase,
        learningSessionId,
        context,
        candidates.organization,
      );
    } catch {
      // Left unproposed; the memories stand.
    }

    // Checked, because the one-completed-session-per-deliverable index can
    // reject this write. An unchecked failure here would leave the session
    // "running" for ever, and a running session blocks every later retry.
    const { error: completionError } = await supabase
      .from("employee_learning_sessions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        candidate_count: candidates.memories.length,
        accepted_count: result.accepted,
        rejected_count: result.rejected,
      })
      .eq("id", learningSessionId);

    if (completionError) {
      throw new LearningError("LEARNING_SAVE_FAILED", completionError.message);
    }

    return { ok: true, accepted: result.accepted };
  } catch (error) {
    const code =
      error instanceof LearningError
        ? error.code
        : ("LEARNING_EXTRACTION_FAILED" as const);
    const message = error instanceof Error ? error.message : String(error);

    await supabase
      .from("employee_learning_sessions")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        error_code: code,
        error_message: message.slice(0, 500),
      })
      .eq("id", learningSessionId);

    return { ok: false, code };
  }
}

async function loadContextOrFail(
  supabase: Supabase,
  learningSessionId: string,
  deliverableId: string,
): Promise<LearningContext> {
  const result = await loadLearningContext(deliverableId);
  if (!result.ok) {
    throw new LearningError(
      "LEARNING_CONTEXT_INCOMPLETE",
      `missing: ${result.missing.join(", ")}`,
    );
  }

  await supabase
    .from("employee_learning_sessions")
    .update({
      input_snapshot: {
        capturedAt: new Date().toISOString(),
        employee: result.context.employee,
        companyKnowledge: result.context.companyKnowledge,
        assignment: result.context.assignment,
        approvedDeliverableId: result.context.approvedDeliverable.id,
        approvedVersion: result.context.approvedDeliverable.version,
        reviewCount: result.context.managerReviews.length,
        existingMemoryCount: result.context.existingMemories.length,
      },
    })
    .eq("id", learningSessionId);

  return result.context;
}

async function extractCandidates(
  providers: Providers,
  context: LearningContext,
): Promise<{
  memories: MemoryCandidate[];
  organization: OrganizationCandidate[];
}> {
  const { system, input } = buildLearningPrompt(context);

  let output;
  try {
    const result = await providers.ai.generateStructuredOutput({
      systemInstructions: system,
      input,
      schema: learningOutputSchema,
      schemaName: "memory_candidates",
      maxTokens: 24000,
      // Routine: this restates what a finished review already established. The
      // evidence — the deliverable, the manager's words, the sources — is all
      // in the input, and nothing it produces takes effect until the manager
      // adopts it. It was 24% of everything this company had ever spent, on
      // two calls, which is what made it worth moving.
      tier: "routine",
    });
    output = result.output;
  } catch (error) {
    throw new LearningError(
      "LEARNING_EXTRACTION_FAILED",
      error instanceof Error ? error.message : undefined,
    );
  }

  // Trim to the caps rather than trusting the model to have counted.
  const perCategory: Record<string, number> = {};
  const kept: MemoryCandidate[] = [];

  for (const candidate of output.candidates) {
    if (kept.length >= MAX_CANDIDATES) break;
    const used = perCategory[candidate.category] ?? 0;
    if (used >= CANDIDATE_CAPS[candidate.category as MemoryCategory]) continue;
    perCategory[candidate.category] = used + 1;
    kept.push(candidate);
  }

  // Company knowledge is capped harder than memory and validated for length
  // here rather than downstream, because every one of these reaches every
  // employee on every assignment for as long as it stands.
  const organization = (output.organizationCandidates ?? [])
    .filter(
      (candidate) =>
        candidate.title.trim().length > 0 &&
        candidate.title.length <= KNOWLEDGE_TITLE_HARD_MAX &&
        candidate.summary.trim().length > 0 &&
        candidate.summary.length <= KNOWLEDGE_SUMMARY_HARD_MAX,
    )
    .slice(0, MAX_ORGANIZATION_CANDIDATES);

  return { memories: kept, organization };
}

function validityFor(category: MemoryCategory): string | null {
  const days = VALIDITY_DAYS[category];
  if (days === null) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Detects whether a candidate contradicts what the employee was taught during
 * onboarding. A contradiction is never applied silently — the manager decides,
 * because the alternative is an employee quietly rewriting its own briefing.
 */
function detectKnowledgeConflict(
  candidate: MemoryCandidate,
  context: LearningContext,
): { type: ConflictType; reason: string } | null {
  if (candidate.category !== "company_fact") return null;

  const knowledge = [
    context.companyKnowledge.companySummary,
    context.companyKnowledge.customerSummary,
    context.companyKnowledge.problemSummary,
    context.companyKnowledge.differentiationSummary ?? "",
  ].join(" ");

  // Only claims about who the company serves are checked here — that is the
  // field a market-research assignment is most likely to appear to contradict.
  const aboutCustomers = /\b(customer|segment|target|audience|market|buyer)\b/i.test(
    candidate.content,
  );
  if (!aboutCustomers) return null;

  const overlap = similarity(candidate.content, knowledge);
  if (overlap > 0.2) return null;

  return {
    type: "knowledge_conflict",
    reason:
      "This information may not match what the employee was told about the company during onboarding.",
  };
}

async function persistCandidates(
  supabase: Supabase,
  learningSessionId: string,
  context: LearningContext,
  candidates: MemoryCandidate[],
): Promise<{ accepted: number; rejected: number }> {
  // Ids the model is allowed to cite, checked against rows this caller can see.
  const validSourceIds = new Set<string>([
    context.approvedDeliverable.id,
    ...context.managerReviews.map((review) => review.id),
    ...context.deliverableSources.map((source) => source.id),
  ]);

  const { data: existingRows } = await supabase
    .from("employee_memories")
    .select("id, category, title, content, status")
    .eq("company_employee_id", context.companyEmployeeId)
    .in("status", ["active", "pending_review"]);

  const existing = (existingRows ?? []) as {
    id: string;
    category: string;
    title: string;
    content: string;
  }[];

  let accepted = 0;
  let rejected = 0;

  for (const candidate of candidates) {
    const shapeProblem = validateCandidate(candidate);
    if (shapeProblem) {
      await recordCandidate(supabase, learningSessionId, context, candidate, {
        decision: "rejected",
        rejectionReason: shapeProblem.reason,
      });
      rejected += 1;
      continue;
    }

    const unknownSource = candidate.sourceReferences.find(
      (ref) => !validSourceIds.has(ref.id),
    );
    if (unknownSource) {
      await recordCandidate(supabase, learningSessionId, context, candidate, {
        decision: "rejected",
        rejectionReason: `unknown_source:${unknownSource.id}`,
      });
      rejected += 1;
      continue;
    }

    // Same lesson, learned again: record the new evidence rather than a copy.
    const duplicate = existing.find(
      (memory) =>
        memory.category === candidate.category &&
        (similarity(memory.title, candidate.title) >= DUPLICATE_THRESHOLD ||
          similarity(memory.content, candidate.content) >= DUPLICATE_THRESHOLD),
    );

    if (duplicate) {
      await supabase
        .from("employee_memories")
        .update({
          last_confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", duplicate.id);

      await linkSources(
        supabase,
        duplicate.id,
        learningSessionId,
        candidate,
        context,
      );

      await recordCandidate(supabase, learningSessionId, context, candidate, {
        decision: "merged",
        matchedMemoryId: duplicate.id,
      });
      continue;
    }

    // A guess is not a lesson. It stays in the candidate log for the record,
    // but it never reaches the employee.
    if (candidate.confidence === "low") {
      await recordCandidate(supabase, learningSessionId, context, candidate, {
        decision: "rejected",
        rejectionReason: "low_confidence",
      });
      rejected += 1;
      continue;
    }

    const conflict = detectKnowledgeConflict(candidate, context);

    // High confidence goes straight in; anything less, or anything that looks
    // like it contradicts the briefing, waits for the manager.
    const status =
      conflict || candidate.confidence !== "high" ? "pending_review" : "active";

    const { data: created } = await supabase
      .from("employee_memories")
      .insert({
        company_id: context.companyId,
        company_employee_id: context.companyEmployeeId,
        category: candidate.category,
        title: candidate.title.trim(),
        content: candidate.content.trim(),
        status,
        confidence: candidate.confidence,
        source_type: candidate.sourceType,
        conflict_type: conflict?.type ?? null,
        conflict_reason: conflict?.reason ?? null,
        last_confirmed_at: status === "active" ? new Date().toISOString() : null,
        valid_until: validityFor(candidate.category),
      })
      .select("id")
      .single();

    if (!created) {
      await recordCandidate(supabase, learningSessionId, context, candidate, {
        decision: "rejected",
        rejectionReason: "save_failed",
      });
      rejected += 1;
      continue;
    }

    await linkSources(supabase, created.id, learningSessionId, candidate, context);

    existing.push({
      id: created.id,
      category: candidate.category,
      title: candidate.title,
      content: candidate.content,
    });

    await recordCandidate(supabase, learningSessionId, context, candidate, {
      decision: status === "active" ? "created" : "pending_review",
      matchedMemoryId: created.id,
    });

    accepted += 1;
  }

  return { accepted, rejected };
}

async function linkSources(
  supabase: Supabase,
  memoryId: string,
  learningSessionId: string,
  candidate: MemoryCandidate,
  context: LearningContext,
) {
  const reviewIds = new Set(context.managerReviews.map((review) => review.id));
  const sourceIds = new Set(context.deliverableSources.map((source) => source.id));

  for (const reference of candidate.sourceReferences) {
    // Trust the id's real table over the label the model attached to it.
    const sourceType = reviewIds.has(reference.id)
      ? "deliverable_review"
      : sourceIds.has(reference.id)
        ? "research_source"
        : "deliverable";

    await supabase
      .from("employee_memory_sources")
      .upsert(
        {
          employee_memory_id: memoryId,
          source_type: sourceType,
          source_id: reference.id,
          learning_session_id: learningSessionId,
        },
        { onConflict: "employee_memory_id,source_type,source_id" },
      );
  }
}

async function recordCandidate(
  supabase: Supabase,
  learningSessionId: string,
  context: LearningContext,
  candidate: MemoryCandidate,
  outcome: {
    decision: CandidateDecision;
    matchedMemoryId?: string;
    rejectionReason?: string;
  },
) {
  await supabase.from("employee_memory_candidates").insert({
    learning_session_id: learningSessionId,
    company_employee_id: context.companyEmployeeId,
    category: candidate.category,
    title: candidate.title.slice(0, 200),
    content: candidate.content.slice(0, 1000),
    reason: candidate.reason?.slice(0, 600) ?? null,
    confidence: candidate.confidence,
    source_type: candidate.sourceType,
    source_references_json: candidate.sourceReferences,
    decision: outcome.decision,
    matched_memory_id: outcome.matchedMemoryId ?? null,
    rejection_reason: outcome.rejectionReason ?? null,
  });
}
