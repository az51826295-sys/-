import type { SearchResult } from "@/lib/providers/types";
import { ExecutionError, setStep } from "@/lib/execution/shared";
import { recordAppliedMemories } from "@/lib/memory/retrieval";
import { normalizeUrl, domainOf } from "@/lib/research/url";
import {
  companyDomainOf,
  findAggregatorDomains,
  nameMatchesDomain,
  normalizeCompanyName,
} from "@/lib/leads/identity";
import { fitLabelFor, qualifyCandidate } from "@/lib/leads/qualification";
import {
  buildCandidateExtractionPrompt,
  buildLeadListPrompt,
  buildLeadPlanPrompt,
  type SourceForPrompt,
  type StoredCandidateForPrompt,
} from "@/lib/leads/prompts";
import {
  candidateExtractionSchema,
  leadListOutputSchema,
  leadResearchPlanSchema,
  MAX_CANDIDATE_PAGES,
  MAX_COMPANY_QUERIES,
  MAX_DETAILED_CANDIDATES,
  MAX_LEADS_IN_DELIVERABLE,
  MAX_RESULTS_PER_COMPANY_QUERY,
  MAX_SOURCE_CHARS_PER_PAGE,
  meetsMinimumLeadCount,
  type ExtractedCandidate,
  type LeadListDeliverable,
  type LeadListRow,
  type LeadResearchPlan,
} from "@/lib/leads/types";
import {
  leadResearchAssignmentSchema,
  leadResearchKnowledgeSchema,
  type LeadResearchAssignmentInput,
  type LeadResearchKnowledge,
} from "@/lib/roles/schemas";
import type {
  EmployeeSkill,
  SkillExecutionResult,
  SkillRunContext,
} from "@/lib/skills/types";

/**
 * How a sales development representative works: decide what a good customer
 * looks like, find companies, check each one against the manager's criteria,
 * and hand over a list where every row can be traced back to a page.
 *
 * The order matters. Companies are stored as structured records *before* the
 * deliverable is written, and the writing step may only reference records that
 * already exist. That is what makes an invented company unrepresentable rather
 * than merely discouraged.
 */

interface StoredLeadSource extends SourceForPrompt {
  accessedAt: string;
  fetchStatus: string;
}

function parseKnowledge(raw: unknown): LeadResearchKnowledge | null {
  const parsed = leadResearchKnowledgeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * The assignment's own filters, falling back to the onboarding profile for
 * anything the manager left blank on this assignment. The profile is read, never
 * written: a one-off filter must not silently retrain the employee.
 */
function resolveInput(
  rawInput: unknown,
  knowledge: LeadResearchKnowledge | null,
): LeadResearchAssignmentInput {
  const parsed = leadResearchAssignmentSchema.safeParse(rawInput ?? {});
  const input = parsed.success ? parsed.data : leadResearchAssignmentSchema.parse({});

  if (!knowledge) return input;
  const icp = knowledge.idealCustomerProfile;

  return {
    ...input,
    industries: input.industries.length ? input.industries : icp.industries,
    locations: input.locations.length ? input.locations : icp.locations,
    employeeRange: input.employeeRange ?? icp.employeeRange,
    requiredSignals: input.requiredSignals.length
      ? input.requiredSignals
      : [],
    // Exclusions accumulate rather than override. A company the manager told
    // Emma to avoid during onboarding stays excluded even if this assignment
    // lists different ones.
    excludedCompanies: [
      ...new Set([...icp.excludedCompanies, ...input.excludedCompanies]),
    ],
    buyerRoles: input.buyerRoles.length ? input.buyerRoles : knowledge.buyerRoles,
  };
}

async function createLeadPlan(
  ctx: SkillRunContext,
  knowledge: LeadResearchKnowledge | null,
  input: LeadResearchAssignmentInput,
): Promise<LeadResearchPlan> {
  const { supabase, executionId, providers, context, memories } = ctx;

  await setStep(supabase, executionId, "lead_plan_created");

  const { system, input: promptInput } = buildLeadPlanPrompt(
    context,
    knowledge,
    input,
    memories,
    ctx.history?.previouslyDeliveredDomains ?? [],
  );

  let plan;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const result = await providers.ai.generateStructuredOutput({
      systemInstructions: system,
      input: promptInput,
      schema: leadResearchPlanSchema,
      schemaName: "lead_research_plan",
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

  const queries = plan.companySearchQueries
    .map((query) => query.trim())
    .filter((query) => query.length > 0 && query.length <= 200)
    .slice(0, MAX_COMPANY_QUERIES);

  if (queries.length < 2) {
    throw new ExecutionError("INVALID_RESEARCH_PLAN", "too few usable queries");
  }

  const trimmed: LeadResearchPlan = {
    objective: plan.objective.trim(),
    targetCount: input.targetCount,
    qualificationCriteria: plan.qualificationCriteria.slice(0, 8),
    exclusionCriteria: plan.exclusionCriteria.slice(0, 10),
    companySearchQueries: queries,
    buyerRoles: plan.buyerRoles.slice(0, 10),
    evidenceRequirements: plan.evidenceRequirements.slice(0, 8),
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

async function discoverCompanyPages(
  ctx: SkillRunContext,
  plan: LeadResearchPlan,
): Promise<{ sources: StoredLeadSource[]; searchCount: number }> {
  const { supabase, executionId, providers, execution } = ctx;

  await setStep(supabase, executionId, "company_discovery");

  const seen = new Set<string>();
  const results: SearchResult[] = [];
  let searchCount = 0;
  let searchFailures = 0;

  for (const query of plan.companySearchQueries) {
    if (results.length >= MAX_CANDIDATE_PAGES) break;
    try {
      const found = await providers.search.search(
        query,
        MAX_RESULTS_PER_COMPANY_QUERY,
      );
      searchCount += 1;
      for (const result of found) {
        const normalized = normalizeUrl(result.url);
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        results.push(result);
        if (results.length >= MAX_CANDIDATE_PAGES) break;
      }
    } catch {
      searchFailures += 1;
    }
  }

  if (searchCount === 0 && searchFailures > 0) {
    throw new ExecutionError("SEARCH_FAILED", "every search request failed");
  }
  if (results.length === 0) {
    throw new ExecutionError("NO_RELEVANT_SOURCES");
  }

  await setStep(supabase, executionId, "company_validation");

  // Pages are capped per company domain so one company with a large site can't
  // consume the whole budget and crowd out the rest of the list.
  const perDomain = new Map<string, number>();
  const selected: SearchResult[] = [];

  for (const result of results) {
    const domain = domainOf(result.url);
    const used = perDomain.get(domain) ?? 0;
    if (used >= 5) continue;
    perDomain.set(domain, used + 1);
    selected.push(result);
    if (selected.length >= MAX_DETAILED_CANDIDATES * 2) break;
  }

  const stored: StoredLeadSource[] = [];

  for (const result of selected) {
    const accessedAt = new Date().toISOString();
    let content = result.rawContent ?? "";
    let fetchStatus: string = content ? "fetched" : "discovered";
    let publishedAt = result.publishedAt;

    if (!content) {
      try {
        const fetched = await providers.fetcher.fetch(result.url);
        content = fetched.text;
        publishedAt = fetched.publishedAt ?? publishedAt;
        fetchStatus = content ? "fetched" : "failed";
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        fetchStatus = message.startsWith("BLOCKED_") ? "blocked" : "failed";
      }
    }

    const usable = content.slice(0, MAX_SOURCE_CHARS_PER_PAGE) || (result.snippet ?? "");
    if (!usable.trim()) continue;

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
        source_type: "company_page",
        snippet: result.snippet ?? null,
        content_text: usable,
        published_at: publishedAt ?? null,
        accessed_at: accessedAt,
        fetch_status: fetchStatus,
        relevance_score: 0,
        trust_score: 0,
        selected_for_deliverable: false,
      })
      .select("id")
      .single();

    if (!inserted) continue;

    stored.push({
      id: inserted.id as string,
      title: result.title,
      url: result.url,
      domain: domainOf(result.url),
      publishedAt: publishedAt ?? undefined,
      content: usable,
      accessedAt,
      fetchStatus,
    });
  }

  await supabase
    .from("work_executions")
    .update({ search_request_count: searchCount, source_fetch_count: stored.length })
    .eq("id", executionId);

  if (stored.length === 0) {
    throw new ExecutionError("NO_RELEVANT_SOURCES");
  }

  return { sources: stored, searchCount };
}

async function extractCandidates(
  ctx: SkillRunContext,
  plan: LeadResearchPlan,
  input: LeadResearchAssignmentInput,
  knowledge: LeadResearchKnowledge | null,
  sources: StoredLeadSource[],
): Promise<ExtractedCandidate[]> {
  const { supabase, executionId, providers, context } = ctx;

  await setStep(supabase, executionId, "contact_role_research");

  const { system, input: promptInput } = buildCandidateExtractionPrompt(
    context,
    plan,
    input,
    knowledge,
    sources,
  );

  try {
    const result = await providers.ai.generateStructuredOutput({
      systemInstructions: system,
      input: promptInput,
      schema: candidateExtractionSchema,
      schemaName: "lead_candidates",
      // Reads every collected page and writes a record per company, so this is
      // the longest output in the run.
      maxTokens: 48000,
    });
    return result.output.candidates;
  } catch (error) {
    throw new ExecutionError(
      "MODEL_DELIVERABLE_FAILED",
      error instanceof Error ? error.message : undefined,
    );
  }
}

interface PersistedCandidate {
  id: string;
  candidate: ExtractedCandidate;
  domain: string;
  score: number;
  status: string;
  matchedCriteria: string[];
  missingCriteria: string[];
  citationSourceIds: string[];
}

/**
 * Turns extracted companies into stored records, dropping anything whose
 * evidence doesn't hold up. Every source id the model cited is checked against
 * the sources it was actually given — an id it invented is not a weak citation,
 * it is a sign the row is fabricated.
 */
async function persistCandidates(
  ctx: SkillRunContext,
  extracted: ExtractedCandidate[],
  input: LeadResearchAssignmentInput,
  knowledge: LeadResearchKnowledge | null,
  sources: StoredLeadSource[],
): Promise<{ persisted: PersistedCandidate[]; excludedCount: number }> {
  const { supabase, executionId, execution } = ctx;

  await setStep(supabase, executionId, "lead_scoring");

  const validSourceIds = new Set(sources.map((source) => source.id));
  const byDomain = new Map<string, PersistedCandidate>();
  const alreadyDelivered = new Set(ctx.history?.previouslyDeliveredDomains ?? []);
  let excludedCount = 0;

  // Directories give themselves away by hosting several different companies.
  // Worked out from this run's own results, so a job board nobody has heard of
  // is caught the same as a well-known one.
  const aggregators = findAggregatorDomains(
    extracted
      .map((candidate) => ({
        domain: companyDomainOf(candidate.websiteUrl) ?? "",
        companyName: candidate.companyName,
      }))
      .filter((entry) => entry.domain),
  );

  for (const candidate of extracted) {
    // A company page on somebody else's platform is evidence about a company,
    // never the company itself, so it can't anchor a lead.
    const domain = companyDomainOf(candidate.websiteUrl);
    if (!domain || aggregators.has(domain)) {
      excludedCount += 1;
      continue;
    }

    // A repeat of this schedule should bring new companies. Handing back the
    // same prospects the manager already approved last time is not research.
    if (alreadyDelivered.has(domain)) {
      excludedCount += 1;
      continue;
    }

    const identityIds = candidate.identitySourceIds.filter((id) =>
      validSourceIds.has(id),
    );
    if (identityIds.length === 0) {
      excludedCount += 1;
      continue;
    }

    // Signals stand or fall on their own evidence: a company can be a good lead
    // with none, but a signal without a source is a claim we can't back.
    const signals = candidate.buyingSignals
      .map((signal) => ({
        ...signal,
        sourceIds: signal.sourceIds.filter((id) => validSourceIds.has(id)),
      }))
      .filter((signal) => signal.sourceIds.length > 0);

    const contacts = candidate.verifiedContacts
      .map((contact) => ({
        ...contact,
        sourceIds: contact.sourceIds.filter((id) => validSourceIds.has(id)),
      }))
      .filter((contact) => contact.sourceIds.length > 0 && contact.name.trim());

    // A published address only counts if it belongs to this company's domain.
    // Anything else is either a third party's address or a guess.
    const email = candidate.publicContactEmail.trim().toLowerCase();
    const publicEmail =
      email && email.includes("@") && email.endsWith(`@${domain}`) ? email : null;

    const cleaned: ExtractedCandidate = {
      ...candidate,
      buyingSignals: signals,
      verifiedContacts: contacts,
      publicContactEmail: publicEmail ?? "",
      identitySourceIds: identityIds,
    };

    const qualification = qualifyCandidate(
      cleaned,
      input,
      knowledge?.idealCustomerProfile.excludedCompanies ?? [],
    );

    // A name with nothing in common with its own web address is usually a page
    // title mistaken for a company. Not fatal on its own — companies do rebrand
    // — so it is surfaced to the manager rather than silently dropping a lead.
    if (!nameMatchesDomain(cleaned.companyName, domain)) {
      qualification.missingCriteria.push("Company identity");
    }

    if (
      qualification.status === "not_qualified" ||
      qualification.status === "insufficient_information"
    ) {
      excludedCount += 1;
      // Kept out of the manager's list but recorded, so "why isn't X here?" has
      // an answer.
      await supabase.from("lead_candidates").upsert(
        {
          company_id: execution.company_id,
          assignment_id: execution.assignment_id,
          work_execution_id: executionId,
          company_employee_id: execution.company_employee_id,
          company_name: cleaned.companyName,
          normalized_company_name: normalizeCompanyName(cleaned.companyName),
          website_url: cleaned.websiteUrl,
          domain,
          qualification_status: qualification.status,
          qualification_score: qualification.score,
          qualification_details_json: qualification,
          selected_for_deliverable: false,
        },
        { onConflict: "work_execution_id,domain" },
      );
      continue;
    }

    const citationSourceIds = [
      ...new Set([
        ...identityIds,
        ...signals.flatMap((signal) => signal.sourceIds),
        ...contacts.flatMap((contact) => contact.sourceIds),
      ]),
    ];

    const existing = byDomain.get(domain);
    if (existing) {
      // The same company found twice: merge the evidence rather than listing it
      // twice, and keep the better-supported description.
      existing.candidate.fitReasons = [
        ...new Set([...existing.candidate.fitReasons, ...cleaned.fitReasons]),
      ];
      existing.candidate.buyingSignals = [
        ...existing.candidate.buyingSignals,
        ...signals,
      ];
      existing.citationSourceIds = [
        ...new Set([...existing.citationSourceIds, ...citationSourceIds]),
      ];
      continue;
    }

    const range = cleaned.employeeRange;
    const hasRange = range.min > 0 || range.max > 0;

    const { data: inserted } = await supabase
      .from("lead_candidates")
      .upsert(
        {
          company_id: execution.company_id,
          assignment_id: execution.assignment_id,
          work_execution_id: executionId,
          company_employee_id: execution.company_employee_id,
          company_name: cleaned.companyName,
          normalized_company_name: normalizeCompanyName(cleaned.companyName),
          website_url: cleaned.websiteUrl,
          domain,
          industry: cleaned.industry || null,
          company_description: cleaned.companyDescription || null,
          employee_range_json: hasRange ? range : null,
          location: cleaned.location || null,
          fit_reasons_json: cleaned.fitReasons,
          buying_signals_json: signals,
          recommended_buyer_roles_json: cleaned.recommendedBuyerRoles,
          verified_contacts_json: contacts,
          public_contact_email: publicEmail,
          qualification_status: qualification.status,
          qualification_score: qualification.score,
          qualification_details_json: qualification,
          selected_for_deliverable: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "work_execution_id,domain" },
      )
      .select("id")
      .single();

    if (!inserted) continue;

    byDomain.set(domain, {
      id: inserted.id as string,
      candidate: cleaned,
      domain,
      score: qualification.score,
      status: qualification.status,
      matchedCriteria: qualification.matchedCriteria,
      missingCriteria: qualification.missingCriteria,
      citationSourceIds,
    });
  }

  await setStep(supabase, executionId, "evidence_validation");

  // Which source backs which part of which lead. Written after the candidate
  // rows exist so the foreign keys hold.
  for (const entry of byDomain.values()) {
    const links: { sourceId: string; evidenceType: string }[] = [
      ...entry.candidate.identitySourceIds.map((sourceId) => ({
        sourceId,
        evidenceType: "company_identity",
      })),
      ...entry.candidate.buyingSignals.flatMap((signal) =>
        signal.sourceIds.map((sourceId) => ({
          sourceId,
          evidenceType: "buying_signal",
        })),
      ),
      ...entry.candidate.verifiedContacts.flatMap((contact) =>
        contact.sourceIds.map((sourceId) => ({
          sourceId,
          evidenceType: "contact_role",
        })),
      ),
    ];

    for (const link of links) {
      await supabase.from("lead_candidate_sources").upsert(
        {
          lead_candidate_id: entry.id,
          research_source_id: link.sourceId,
          evidence_type: link.evidenceType,
        },
        { onConflict: "lead_candidate_id,research_source_id,evidence_type" },
      );
    }
  }

  const persisted = [...byDomain.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_LEADS_IN_DELIVERABLE);

  return { persisted, excludedCount };
}

function sizeLabelFor(candidate: ExtractedCandidate): string | null {
  const { min, max, label } = candidate.employeeRange;
  if (label.trim()) return label.trim();
  if (min > 0 && max > 0) return `${min}–${max} employees`;
  if (max > 0) return `Up to ${max} employees`;
  if (min > 0) return `${min}+ employees`;
  return null;
}

async function generateLeadList(
  ctx: SkillRunContext,
  input: LeadResearchAssignmentInput,
  persisted: PersistedCandidate[],
  excludedCount: number,
  sources: StoredLeadSource[],
): Promise<string> {
  const { supabase, executionId, providers, context, memories } = ctx;

  await setStep(supabase, executionId, "deliverable_generation");

  const forPrompt: StoredCandidateForPrompt[] = persisted.map((entry) => ({
    id: entry.id,
    companyName: entry.candidate.companyName,
    websiteUrl: entry.candidate.websiteUrl,
    industry: entry.candidate.industry || null,
    location: entry.candidate.location || null,
    sizeLabel: sizeLabelFor(entry.candidate),
    fitLabel: fitLabelFor(entry.score),
    matchedCriteria: entry.matchedCriteria,
    missingCriteria: entry.missingCriteria,
    fitReasons: entry.candidate.fitReasons,
    signalDescriptions: entry.candidate.buyingSignals.map((s) => s.description),
    buyerRoles: entry.candidate.recommendedBuyerRoles,
    hasVerifiedContact: entry.candidate.verifiedContacts.length > 0,
  }));

  const { system, input: promptInput } = buildLeadListPrompt(
    context,
    input,
    forPrompt,
    excludedCount,
    memories,
  );

  let output;
  try {
    const result = await providers.ai.generateStructuredOutput({
      systemInstructions: system,
      input: promptInput,
      schema: leadListOutputSchema,
      schemaName: "lead_list",
      maxTokens: 32000,
    });
    output = result.output;
  } catch (error) {
    throw new ExecutionError(
      "MODEL_DELIVERABLE_FAILED",
      error instanceof Error ? error.message : undefined,
    );
  }

  // The model orders and explains; the facts come from the stored records. Any
  // id it didn't get is dropped rather than looked up.
  const byId = new Map(persisted.map((entry) => [entry.id, entry]));
  const usedIds = new Set<string>();

  const ordered = output.leads
    .filter((lead) => {
      if (!byId.has(lead.leadCandidateId)) return false;
      if (usedIds.has(lead.leadCandidateId)) return false;
      usedIds.add(lead.leadCandidateId);
      return true;
    })
    .sort((a, b) => a.rank - b.rank);

  // Anything the model left out is still a verified lead and still belongs in
  // the list; it simply goes at the end.
  const missing = persisted.filter((entry) => !usedIds.has(entry.id));

  const citationNumbers = new Map<string, number>();
  const citations: { sourceId: string; citationNumber: number }[] = [];
  const numberFor = (sourceId: string) => {
    const existing = citationNumbers.get(sourceId);
    if (existing) return existing;
    const next = citationNumbers.size + 1;
    citationNumbers.set(sourceId, next);
    citations.push({ sourceId, citationNumber: next });
    return next;
  };

  const rows: LeadListRow[] = [];

  for (const entry of [
    ...ordered.map((lead) => ({
      entry: byId.get(lead.leadCandidateId)!,
      fitReasons: lead.fitReasons,
      buyerRoles: lead.recommendedBuyerRoles,
    })),
    ...missing.map((entry) => ({
      entry,
      fitReasons: entry.candidate.fitReasons,
      buyerRoles: entry.candidate.recommendedBuyerRoles,
    })),
  ]) {
    const candidate = entry.entry.candidate;
    const limitations: string[] = [];

    if (!sizeLabelFor(candidate)) {
      limitations.push("Company size is not published in the sources found.");
    }
    if (candidate.verifiedContacts.length === 0) {
      limitations.push("No current contact was verified for this company.");
    }
    if (entry.entry.missingCriteria.length > 0) {
      limitations.push(
        `Could not verify: ${entry.entry.missingCriteria.join(", ")}.`,
      );
    }

    rows.push({
      leadCandidateId: entry.entry.id,
      companyName: candidate.companyName,
      websiteUrl: candidate.websiteUrl,
      industry: candidate.industry || undefined,
      companySize: sizeLabelFor(candidate) ?? undefined,
      location: candidate.location || undefined,
      fitLabel: fitLabelFor(entry.entry.score),
      // The model's wording is preferred, but never at the cost of losing the
      // researched reason entirely.
      fitReasons: entry.fitReasons.length ? entry.fitReasons : candidate.fitReasons,
      buyingSignals: candidate.buyingSignals.map((signal) => ({
        description: signal.description,
        observedAt: signal.observedAt || undefined,
        citationNumbers: signal.sourceIds.map(numberFor),
      })),
      recommendedBuyerRoles: entry.buyerRoles.length
        ? entry.buyerRoles
        : candidate.recommendedBuyerRoles,
      verifiedContacts: candidate.verifiedContacts.map((contact) => ({
        name: contact.name,
        title: contact.title,
        profileUrl: contact.profileUrl || undefined,
        citationNumbers: contact.sourceIds.map(numberFor),
      })),
      publicContactEmail: candidate.publicContactEmail || undefined,
      citationNumbers: candidate.identitySourceIds.map(numberFor),
      limitations,
    });
  }

  if (
    !meetsMinimumLeadCount(
      rows.length,
      input.targetCount,
      ctx.assignmentType !== "manager",
    )
  ) {
    throw new ExecutionError(
      "NO_RELEVANT_SOURCES",
      `only ${rows.length} verified leads for a target of ${input.targetCount}`,
    );
  }

  const limitations = [...output.researchLimitations];
  if (rows.length < input.targetCount) {
    limitations.unshift(
      `${context.employee.name} found ${rows.length} ${rows.length === 1 ? "company" : "companies"} that met the evidence and qualification requirements, out of the ${input.targetCount} requested. The remaining candidates were left out because their fit could not be verified.`,
    );
  }

  const deliverable: LeadListDeliverable = {
    title: output.title,
    executiveSummary: output.executiveSummary,
    targetProfileSummary: {
      industries: output.targetProfileSummary.industries,
      locations: output.targetProfileSummary.locations,
      employeeRange: output.targetProfileSummary.employeeRange || undefined,
      keySignals: output.targetProfileSummary.keySignals,
    },
    requestedCount: input.targetCount,
    verifiedCount: rows.length,
    leads: rows,
    researchLimitations: limitations,
    recommendedNextSteps: output.recommendedNextSteps,
  };

  // Only the sources actually cited become the deliverable's evidence list.
  const citedIds = new Set(citations.map((citation) => citation.sourceId));
  await supabase
    .from("research_sources")
    .update({ selected_for_deliverable: true })
    .eq("work_execution_id", executionId)
    .in("id", [...citedIds]);

  await setStep(supabase, executionId, "submitting");

  const { data, error } = await supabase.rpc("submit_generated_deliverable", {
    p_execution_id: executionId,
    p_title: output.title,
    p_deliverable_type: "lead_list",
    p_content_markdown: renderLeadListMarkdown(deliverable, sources, citationNumbers),
    p_content_json: deliverable,
    p_generation_model: providers.ai.model,
    p_citations: citations,
  });

  if (error) throw new ExecutionError("DELIVERABLE_SAVE_FAILED", error.message);

  const rpc = data as { ok: boolean; reason?: string; deliverableId?: string };
  if (!rpc.ok) {
    if (rpc.reason === "already_submitted" && rpc.deliverableId) {
      return rpc.deliverableId;
    }
    throw new ExecutionError("DELIVERABLE_SAVE_FAILED", rpc.reason);
  }

  try {
    await recordAppliedMemories(
      executionId,
      rpc.deliverableId!,
      [],
      memories,
      supabase,
    );
  } catch {
    // Bookkeeping only; the lead list stands.
  }

  return rpc.deliverableId!;
}

/**
 * A readable summary for the places that show markdown — the list itself lives
 * in content_json, which is the source of truth. Individual leads are
 * deliberately not rendered here: a table flattened into prose is worse than a
 * pointer to the table.
 */
function renderLeadListMarkdown(
  deliverable: LeadListDeliverable,
  sources: StoredLeadSource[],
  citationNumbers: Map<string, number>,
): string {
  const byId = new Map(sources.map((source) => [source.id, source]));

  const lines = [
    `# ${deliverable.title}`,
    "",
    deliverable.executiveSummary,
    "",
    "## Target Profile",
    "",
    `- Industries: ${deliverable.targetProfileSummary.industries.join(", ") || "not specified"}`,
    `- Locations: ${deliverable.targetProfileSummary.locations.join(", ") || "not specified"}`,
    `- Company size: ${deliverable.targetProfileSummary.employeeRange ?? "not specified"}`,
    `- Signals watched for: ${deliverable.targetProfileSummary.keySignals.join(", ") || "none specified"}`,
    "",
    "## Results",
    "",
    `Requested: ${deliverable.requestedCount} companies`,
    `Verified: ${deliverable.verifiedCount} companies`,
    "",
  ];

  if (deliverable.researchLimitations.length > 0) {
    lines.push("## Limitations", "");
    lines.push(...deliverable.researchLimitations.map((item) => `- ${item}`));
    lines.push("");
  }

  if (deliverable.recommendedNextSteps.length > 0) {
    lines.push("## Recommended Next Steps", "");
    lines.push(
      ...deliverable.recommendedNextSteps.map((step, index) => `${index + 1}. ${step}`),
    );
    lines.push("");
  }

  const cited = [...citationNumbers.entries()].sort((a, b) => a[1] - b[1]);
  if (cited.length > 0) {
    lines.push("## Sources", "");
    for (const [sourceId, number] of cited) {
      const source = byId.get(sourceId);
      if (!source) continue;
      lines.push(`${number}. [${source.title}](${source.url}) — ${source.domain}`);
    }
  }

  return lines.join("\n");
}

export const leadResearchSkill: EmployeeSkill = {
  id: "lead_research",
  deliverableType: "lead_list",

  capabilities: [
    {
      id: "lead_qualification",
      label: "Find and qualify companies against the ideal customer profile",
      produces: "A verified list of companies with fit reasons and evidence",
      // A handful, not a prospect list: this is a section of somebody else's
      // report, and the minimum-results rule would otherwise fail the errand
      // for returning exactly what was wanted.
      internalRoleInput: { targetCount: 5 },
    },
    {
      id: "buyer_role_research",
      label: "Identify which roles to approach at named companies",
      produces: "Recommended buyer roles, with any publicly verified contacts",
      internalRoleInput: { targetCount: 3 },
    },
  ],
  acceptsInternalRequests: true,

  async run(ctx: SkillRunContext): Promise<SkillExecutionResult> {
    const knowledge = parseKnowledge(ctx.context.roleKnowledge);
    const input = resolveInput(ctx.context.roleInput, knowledge);

    // An employee that doesn't know what a good customer looks like can't find
    // one, and would fill the list with plausible-looking noise instead.
    if (!knowledge || knowledge.buyerRoles.length === 0) {
      throw new ExecutionError(
        "CONTEXT_INCOMPLETE",
        "missing: Ideal customer profile",
      );
    }

    const plan = await createLeadPlan(ctx, knowledge, input);
    const { sources, searchCount } = await discoverCompanyPages(ctx, plan);
    const extracted = await extractCandidates(ctx, plan, input, knowledge, sources);
    const { persisted, excludedCount } = await persistCandidates(
      ctx,
      extracted,
      input,
      knowledge,
      sources,
    );

    const deliverableId = await generateLeadList(
      ctx,
      input,
      persisted,
      excludedCount,
      sources,
    );

    return {
      deliverableId,
      deliverableType: "lead_list",
      metrics: {
        searchCount,
        sourceCount: sources.length,
        candidateCount: extracted.length,
        selectedCount: persisted.length,
      },
    };
  },
};
