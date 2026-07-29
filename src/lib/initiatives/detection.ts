import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { defaultProviders, type Providers } from "@/lib/execution/shared";
import type { EmployeeWorkContextV5 } from "@/lib/execution/context";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { retrieveMemoriesForAssignment } from "@/lib/memory/retrieval";
import { normalizeUrl, domainOf } from "@/lib/research/url";
import { getOpportunityDetector } from "@/lib/initiatives/detectors";
import { meterProviders } from "@/lib/costs/meter";
import { resolvePolicies } from "@/lib/policies/resolve";
import { retrieveCompanyKnowledge } from "@/lib/knowledge/retrieval";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import {
  buildInitiativePrompt,
  buildObservationQueriesPrompt,
  type ObservationForPrompt,
} from "@/lib/initiatives/prompts";
import {
  DISMISSED_SIGNAL_COOLDOWN_DAYS,
  INITIATIVE_EXPIRY_DAYS,
  initiativeDetectionSchema,
  MAX_OBSERVATION_CHARS,
  MAX_OBSERVATION_QUERIES,
  MAX_OBSERVATIONS,
  MAX_PROPOSALS_PER_RUN,
  MAX_RESULTS_PER_OBSERVATION_QUERY,
  MIN_EVIDENCE_PER_INITIATIVE,
  type DetectionErrorCode,
  type InitiativeConfidence,
  type ProposedInitiative,
} from "@/lib/initiatives/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

class DetectionError extends Error {
  constructor(
    readonly code: DetectionErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

const querySchema = z.object({ queries: z.array(z.string()) });

export interface DetectionResult {
  ok: boolean;
  runId: string;
  created: number;
  suppressed: number;
  code?: DetectionErrorCode;
}

interface StoredObservation extends ObservationForPrompt {
  normalizedUrl: string;
}

/**
 * One round of an employee looking around on their own.
 *
 * Ends at a proposal. Nothing here creates an assignment, starts work, or
 * spends anything beyond the observation pass — an employee that could set its
 * own work in motion would be spending the company's money on its own judgement,
 * and the manager would find out afterwards.
 */
export async function runOpportunityDetection(
  db: Db,
  companyEmployeeId: string,
  providers: Providers = defaultProviders(),
): Promise<DetectionResult> {
  const { data: hire } = await db
    .from("company_employees")
    .select("id, company_id, onboarding_status, employees(name, slug)")
    .eq("id", companyEmployeeId)
    .maybeSingle();

  if (!hire) {
    return { ok: false, runId: "", created: 0, suppressed: 0, code: "EMPLOYEE_NOT_READY" };
  }

  // Work an employee started on their own is still the company's money, and is
  // the most surprising kind to find on a bill — so it is gated first.
  const blocked = await blockedBySpendLimit(db, hire.company_id as string);
  if (blocked) {
    return { ok: false, runId: "", created: 0, suppressed: 0, code: "EMPLOYEE_NOT_READY" };
  }

  // Detection is work the employee started on their own. It costs the same as
  // work the manager asked for, so it is counted the same way.
  providers = meterProviders(providers, db, {
    companyId: hire.company_id as string,
    companyEmployeeId: companyEmployeeId,
  });

  const { data: run } = await db
    .from("initiative_detection_runs")
    .insert({
      company_id: hire.company_id,
      company_employee_id: companyEmployeeId,
      status: "running",
    })
    .select("id")
    .single();

  if (!run) {
    return { ok: false, runId: "", created: 0, suppressed: 0, code: "DETECTION_FAILED" };
  }

  const runId = run.id as string;

  try {
    if (hire.onboarding_status !== "completed") {
      throw new DetectionError("EMPLOYEE_NOT_READY");
    }

    const employee = (hire as unknown as { employees: { slug: string } }).employees;
    const definition = getEmployeeDefinition(employee?.slug ?? "");
    const detector = definition
      ? getOpportunityDetector(definition.skillId)
      : undefined;

    if (!definition || !detector) {
      throw new DetectionError("DETECTOR_NOT_FOUND");
    }

    const context = await loadDetectionContext(db, companyEmployeeId);
    const queries = await planObservationQueries(providers, context, detector.focus, () =>
      detector.fallbackQueries(context),
    );

    const observations = await collectObservations(
      db,
      runId,
      hire.company_id as string,
      providers,
      queries,
    );

    const result = await proposeInitiatives(
      db,
      runId,
      hire.company_id as string,
      companyEmployeeId,
      definition.assignmentInputSchemaId,
      providers,
      context,
      observations,
      detector.focus,
    );

    await db
      .from("initiative_detection_runs")
      .update({
        status: "completed",
        observations_reviewed: observations.length,
        proposals_made: result.proposed,
        initiatives_created: result.created,
        duplicates_suppressed: result.suppressed,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return {
      ok: true,
      runId,
      created: result.created,
      suppressed: result.suppressed,
    };
  } catch (error) {
    const code =
      error instanceof DetectionError ? error.code : ("DETECTION_FAILED" as const);
    const message = error instanceof Error ? error.message : String(error);

    await db
      .from("initiative_detection_runs")
      .update({
        status: "failed",
        error_code: code,
        error_message: message.slice(0, 500),
        failed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return { ok: false, runId, created: 0, suppressed: 0, code };
  }
}

/**
 * What the employee knows, assembled without an assignment.
 *
 * Deliberately not borrowed from a past assignment: an employee who finished
 * onboarding this morning knows exactly as much about the company as one who
 * has worked here for months, and should be able to notice things on their
 * first day. Everything needed comes from the hire and their knowledge profile.
 *
 * The assignment field is filled with the act of looking itself, because
 * downstream helpers expect one and there is no real assignment here.
 */
async function loadDetectionContext(
  db: Db,
  companyEmployeeId: string,
): Promise<EmployeeWorkContextV5> {
  const { data: hire } = await db
    .from("company_employees")
    .select("id, company_id, employees(*), companies(name, website)")
    .eq("id", companyEmployeeId)
    .maybeSingle();

  if (!hire) throw new DetectionError("EMPLOYEE_NOT_READY", "employee not found");

  const row = hire as unknown as {
    id: string;
    employees: { slug: string; name: string; role: string };
    companies: { name: string; website: string | null };
  };

  const definition = getEmployeeDefinition(row.employees?.slug ?? "");
  if (!definition) throw new DetectionError("DETECTOR_NOT_FOUND");

  const { data: profile } = await db
    .from("employee_knowledge_profiles")
    .select("*")
    .eq("company_employee_id", companyEmployeeId)
    .maybeSingle();

  if (!profile?.company_summary?.trim()) {
    throw new DetectionError("EMPLOYEE_NOT_READY", "company knowledge missing");
  }

  return {
    employee: {
      id: companyEmployeeId,
      slug: row.employees.slug,
      name: row.employees.name,
      role: row.employees.role,
      responsibilities: definition.responsibilities,
      workInstructions: definition.workInstructions,
      deliverableType: definition.deliverable.type,
      // Temperament shapes what is worth raising, not just how work is written.
      workingStyle: [
        definition.workingStyle.headline,
        ...definition.workingStyle.strengths.map((item) => `- ${item}`),
      ].join("\n"),
    },
    company: {
      name: row.companies?.name ?? "",
      website: row.companies?.website ?? undefined,
    },
    companyKnowledge: {
      companySummary: profile.company_summary ?? "",
      customerSummary: profile.customer_summary ?? "",
      problemSummary: profile.problem_summary ?? "",
      differentiationSummary: profile.differentiation_summary ?? undefined,
      competitors: profile.competitors ?? [],
      priorities: profile.priorities ?? [],
      additionalContext: profile.additional_context ?? undefined,
    },
    assignment: {
      id: "",
      title: "Looking for opportunities",
      description:
        "Checking whether anything has happened that this company should act on.",
      priority: "normal",
    },
    roleKnowledge: profile.role_knowledge_json ?? null,
    roleKnowledgeSchemaId:
      (profile.role_knowledge_schema_id as string | null) ??
      definition.roleKnowledgeSchemaId,
    roleInput: null,
    roleInputSchemaId: definition.assignmentInputSchemaId,
    skillId: definition.skillId,
    // Resolved live rather than snapshotted: there is no assignment to pin this
    // to, and noticing something is not work that gets judged afterwards. The
    // standards still belong here — a company that only sells to enterprises
    // should not be handed consumer openings.
    policies: await resolvePolicies(
      db,
      (hire.company_id as string) ?? "",
      companyEmployeeId,
    ),
    // Deliberately absent. A playbook is the method for doing a piece of work,
    // and noticing something is not that — handing an employee the market
    // research method while they are looking around would turn a glance into a
    // research project the manager never asked for.
    playbook: null,
    // Present here, unlike the method: what the company has learned about its
    // market is exactly what should shape whether something is worth noticing.
    companyLearning: await retrieveCompanyKnowledge(
      db,
      (hire.company_id as string) ?? "",
    ),
  };
}

async function planObservationQueries(
  providers: Providers,
  context: EmployeeWorkContextV5,
  focus: string,
  fallback: () => string[],
): Promise<string[]> {
  const { system, input } = buildObservationQueriesPrompt(context, focus);

  try {
    const result = await providers.ai.generateStructuredOutput({
      systemInstructions: system,
      input,
      schema: querySchema,
      schemaName: "observation_queries",
      maxTokens: 8000,
    });

    const queries = result.output.queries
      .map((query) => query.trim())
      .filter((query) => query.length > 0 && query.length <= 200)
      .slice(0, MAX_OBSERVATION_QUERIES);

    if (queries.length > 0) return queries;
  } catch {
    // Falls through to the detector's own queries: not being able to plan is a
    // reason to look with a default net, not to skip looking.
  }

  return fallback().slice(0, MAX_OBSERVATION_QUERIES);
}

async function collectObservations(
  db: Db,
  runId: string,
  companyId: string,
  providers: Providers,
  queries: string[],
): Promise<StoredObservation[]> {
  const seen = new Set<string>();
  const stored: StoredObservation[] = [];

  for (const query of queries) {
    if (stored.length >= MAX_OBSERVATIONS) break;

    let results;
    try {
      results = await providers.search.search(query, MAX_RESULTS_PER_OBSERVATION_QUERY);
    } catch {
      continue;
    }

    for (const result of results) {
      if (stored.length >= MAX_OBSERVATIONS) break;

      const normalized = normalizeUrl(result.url);
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      // Search snippets carry enough to judge whether something happened, so
      // pages are not fetched individually here — this pass runs on a timer for
      // every employee and should stay cheap.
      const content = (result.rawContent ?? result.snippet ?? "").slice(
        0,
        MAX_OBSERVATION_CHARS,
      );
      if (!content.trim()) continue;

      const accessedAt = new Date().toISOString();

      const { data: inserted } = await db
        .from("initiative_observations")
        .insert({
          company_id: companyId,
          detection_run_id: runId,
          title: result.title,
          url: result.url,
          normalized_url: normalized,
          domain: domainOf(result.url),
          snippet: result.snippet ?? null,
          content_text: content,
          published_at: result.publishedAt ?? null,
          accessed_at: accessedAt,
        })
        .select("id")
        .single();

      if (!inserted) continue;

      stored.push({
        id: inserted.id as string,
        title: result.title,
        url: result.url,
        domain: domainOf(result.url),
        publishedAt: result.publishedAt,
        content,
        normalizedUrl: normalized,
      });
    }
  }

  if (stored.length === 0) throw new DetectionError("NO_OBSERVATIONS");

  return stored;
}

/**
 * Turns what was found into proposals, or into nothing.
 *
 * Evidence is attached from the stored observations rather than from anything
 * the model wrote, and a proposal left with no evidence after that filtering is
 * discarded — it was built on ids that don't exist.
 */
async function proposeInitiatives(
  db: Db,
  runId: string,
  companyId: string,
  companyEmployeeId: string,
  roleInputSchemaId: string,
  providers: Providers,
  context: EmployeeWorkContextV5,
  observations: StoredObservation[],
  focus: string,
): Promise<{ proposed: number; created: number; suppressed: number }> {
  const memories = await safeMemories(db, companyEmployeeId, context);
  const alreadyRaised = await recentTitles(db, companyEmployeeId);

  const { system, input } = buildInitiativePrompt(
    context,
    observations,
    memories,
    alreadyRaised,
    focus,
  );

  let output;
  try {
    const result = await providers.ai.generateStructuredOutput({
      systemInstructions: system,
      input,
      schema: initiativeDetectionSchema,
      schemaName: "initiative_proposals",
      maxTokens: 24000,
    });
    output = result.output;
  } catch (error) {
    throw new DetectionError(
      "DETECTION_FAILED",
      error instanceof Error ? error.message : undefined,
    );
  }

  if (output.nothingNoteworthy || output.proposals.length === 0) {
    return { proposed: 0, created: 0, suppressed: 0 };
  }

  const byId = new Map(observations.map((entry) => [entry.id, entry]));
  const proposals = output.proposals.slice(0, MAX_PROPOSALS_PER_RUN);

  let created = 0;
  let suppressed = 0;

  for (const proposal of proposals) {
    const evidence = [...new Set(proposal.observationIds)]
      .map((id) => byId.get(id))
      .filter((entry): entry is StoredObservation => Boolean(entry))
      .map((entry) => ({
        observationId: entry.id,
        title: entry.title,
        url: entry.url,
        domain: entry.domain,
        publishedAt: entry.publishedAt,
        kind: proposal.kind,
      }));

    // A proposal citing only ids that were never collected has nothing behind
    // it, whatever it says.
    if (evidence.length < MIN_EVIDENCE_PER_INITIATIVE) continue;

    const dedupeKey = normalizeSignalKey(proposal.signalKey, proposal.title);

    if (await isSuppressed(db, companyEmployeeId, dedupeKey)) {
      suppressed += 1;
      continue;
    }

    const inserted = await persistInitiative(
      db,
      runId,
      companyId,
      companyEmployeeId,
      roleInputSchemaId,
      proposal,
      evidence,
      dedupeKey,
    );

    if (inserted) created += 1;
    else suppressed += 1;
  }

  return { proposed: proposals.length, created, suppressed };
}

/** Being unable to recall shouldn't stop an employee noticing something. */
async function safeMemories(
  db: Db,
  companyEmployeeId: string,
  context: EmployeeWorkContextV5,
) {
  try {
    return await retrieveMemoriesForAssignment(
      {
        companyEmployeeId,
        assignmentTitle: "Looking for new opportunities",
        assignmentDescription: `${context.companyKnowledge.companySummary} ${context.companyKnowledge.customerSummary}`,
      },
      db as unknown as Parameters<typeof retrieveMemoriesForAssignment>[1],
    );
  } catch {
    return [];
  }
}

async function recentTitles(db: Db, companyEmployeeId: string): Promise<string[]> {
  const since = new Date(
    Date.now() - DISMISSED_SIGNAL_COOLDOWN_DAYS * 86_400_000,
  ).toISOString();

  const { data } = await db
    .from("initiatives")
    .select("title")
    .eq("company_employee_id", companyEmployeeId)
    .gte("created_at", since)
    .limit(30);

  return (data ?? []).map((row) => row.title as string);
}

/** Comparable form of the event's identity, so wording changes don't create a
 *  second proposal about the same thing. */
function normalizeSignalKey(signalKey: string, title: string): string {
  const source = signalKey.trim() || title;
  return source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/**
 * Whether this signal has already been put to the manager recently.
 *
 * Dismissal is an answer, and asking again next week is how an assistant
 * becomes something you stop reading. Approved and completed ones are held back
 * too — the work is already happening.
 */
async function isSuppressed(
  db: Db,
  companyEmployeeId: string,
  dedupeKey: string,
): Promise<boolean> {
  const since = new Date(
    Date.now() - DISMISSED_SIGNAL_COOLDOWN_DAYS * 86_400_000,
  ).toISOString();

  const { data } = await db
    .from("initiatives")
    .select("id, status, created_at")
    .eq("company_employee_id", companyEmployeeId)
    .eq("dedupe_key", dedupeKey)
    .gte("created_at", since)
    .limit(1);

  return (data ?? []).length > 0;
}

/** Evidence is what makes a proposal solid, so a confident-sounding claim with
 *  one page behind it is not allowed to present as high confidence. */
function temperConfidence(
  claimed: InitiativeConfidence,
  evidenceCount: number,
): { confidence: InitiativeConfidence; score: number } {
  const base = claimed === "high" ? 80 : claimed === "medium" ? 55 : 30;
  const capped = evidenceCount >= 3 ? base : evidenceCount === 2 ? Math.min(base, 70) : Math.min(base, 55);

  return {
    confidence: capped >= 75 ? "high" : capped >= 50 ? "medium" : "low",
    score: capped,
  };
}

async function persistInitiative(
  db: Db,
  runId: string,
  companyId: string,
  companyEmployeeId: string,
  roleInputSchemaId: string,
  proposal: ProposedInitiative,
  evidence: { observationId: string; title: string; url: string; domain: string; publishedAt?: string; kind: string }[],
  dedupeKey: string,
): Promise<boolean> {
  const { confidence, score } = temperConfidence(proposal.confidence, evidence.length);

  const { data: initiative } = await db
    .from("initiatives")
    .insert({
      company_id: companyId,
      company_employee_id: companyEmployeeId,
      detection_run_id: runId,
      title: proposal.title.slice(0, 200),
      summary: proposal.summary.slice(0, 2000),
      recommendation: proposal.recommendation.slice(0, 1000),
      reasoning: proposal.reasoning.slice(0, 2000),
      status: "new",
      priority: proposal.priority,
      confidence,
      confidence_score: score,
      evidence_json: evidence,
      assignment_snapshot: {
        title: proposal.assignmentTitle.slice(0, 200),
        description: proposal.assignmentDescription.slice(0, 5000),
        expectedOutcome: proposal.assignmentExpectedOutcome.slice(0, 2000),
        priority: proposal.priority === "critical" ? "high" : proposal.priority,
      },
      role_input_schema_id: roleInputSchemaId,
      dedupe_key: dedupeKey,
      expires_at: new Date(
        Date.now() + INITIATIVE_EXPIRY_DAYS * 86_400_000,
      ).toISOString(),
    })
    .select("id")
    .maybeSingle();

  // The partial unique index refuses a second open proposal for the same
  // signal, which is the outcome we want rather than an error.
  if (!initiative) return false;

  for (const entry of evidence) {
    await db.from("initiative_evidence").upsert(
      {
        initiative_id: initiative.id as string,
        observation_id: entry.observationId,
      },
      { onConflict: "initiative_id,observation_id" },
    );
  }

  return true;
}
