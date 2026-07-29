import { z } from "zod";

// --- Research plan ----------------------------------------------------------

export const qualificationCriterionSchema = z.object({
  field: z.string(),
  description: z.string(),
  importance: z.enum(["required", "preferred"]),
});

export const leadResearchPlanSchema = z.object({
  objective: z.string(),
  qualificationCriteria: z.array(qualificationCriterionSchema),
  exclusionCriteria: z.array(z.string()),
  companySearchQueries: z.array(z.string()),
  buyerRoles: z.array(z.string()),
  evidenceRequirements: z.array(z.string()),
});

export type LeadResearchPlan = z.infer<typeof leadResearchPlanSchema> & {
  targetCount: number;
};

// --- Candidate extraction ---------------------------------------------------

export const BUYING_SIGNAL_TYPES = [
  "hiring",
  "funding",
  "expansion",
  "product_launch",
  "customer_growth",
  "tool_usage",
  "other",
] as const;

export const buyingSignalSchema = z.object({
  type: z.enum(BUYING_SIGNAL_TYPES),
  description: z.string(),
  observedAt: z.string(),
  sourceIds: z.array(z.string()),
});

export type BuyingSignal = z.infer<typeof buyingSignalSchema>;

export const verifiedContactSchema = z.object({
  name: z.string(),
  title: z.string(),
  profileUrl: z.string(),
  sourceIds: z.array(z.string()),
});

export type VerifiedProfessionalContact = z.infer<typeof verifiedContactSchema>;

export const companyEmployeeRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
  label: z.string(),
});

/**
 * What the model may say about one company. Every field it can get wrong is
 * either tied to a source id or explicitly allowed to be empty — there is no
 * shape here that lets a plausible guess through as a fact.
 */
export const extractedCandidateSchema = z.object({
  companyName: z.string(),
  websiteUrl: z.string(),
  industry: z.string(),
  companyDescription: z.string(),
  employeeRange: companyEmployeeRangeSchema,
  location: z.string(),
  fitReasons: z.array(z.string()),
  buyingSignals: z.array(buyingSignalSchema),
  recommendedBuyerRoles: z.array(z.string()),
  verifiedContacts: z.array(verifiedContactSchema),
  /** A general company address published on the company's own site, or "". */
  publicContactEmail: z.string(),
  /** Why this company is or isn't a match, in the model's own words. */
  qualificationNotes: z.string(),
  excluded: z.boolean(),
  exclusionReason: z.string(),
  identitySourceIds: z.array(z.string()),
});

export type ExtractedCandidate = z.infer<typeof extractedCandidateSchema>;

export const candidateExtractionSchema = z.object({
  candidates: z.array(extractedCandidateSchema),
});

// --- Deliverable ------------------------------------------------------------

export const FIT_LABELS = ["strong_fit", "good_fit", "possible_fit"] as const;
export type FitLabel = (typeof FIT_LABELS)[number];

export const leadListItemSchema = z.object({
  leadCandidateId: z.string(),
  fitReasons: z.array(z.string()),
  recommendedBuyerRoles: z.array(z.string()),
  /** Ordering only. Fit label, company facts and evidence come from the stored
   *  candidate — the model ranks and explains, it does not restate facts. */
  rank: z.number(),
});

export const leadListOutputSchema = z.object({
  title: z.string(),
  executiveSummary: z.string(),
  targetProfileSummary: z.object({
    industries: z.array(z.string()),
    locations: z.array(z.string()),
    employeeRange: z.string(),
    keySignals: z.array(z.string()),
  }),
  leads: z.array(leadListItemSchema),
  researchLimitations: z.array(z.string()),
  recommendedNextSteps: z.array(z.string()),
});

export type LeadListModelOutput = z.infer<typeof leadListOutputSchema>;

/** What is actually stored in content_json and read by the viewer: the model's
 *  ordering and prose, merged with the facts and citations the server holds. */
export interface LeadListDeliverable {
  title: string;
  executiveSummary: string;
  targetProfileSummary: {
    industries: string[];
    locations: string[];
    employeeRange?: string;
    keySignals: string[];
  };
  requestedCount: number;
  verifiedCount: number;
  leads: LeadListRow[];
  researchLimitations: string[];
  recommendedNextSteps: string[];
}

export interface LeadListRow {
  leadCandidateId: string;
  companyName: string;
  websiteUrl: string;
  industry?: string;
  companySize?: string;
  location?: string;
  fitLabel: FitLabel;
  fitReasons: string[];
  buyingSignals: { description: string; observedAt?: string; citationNumbers: number[] }[];
  recommendedBuyerRoles: string[];
  verifiedContacts: {
    name: string;
    title: string;
    profileUrl?: string;
    citationNumbers: number[];
  }[];
  publicContactEmail?: string;
  citationNumbers: number[];
  limitations: string[];
}

// --- Qualification ----------------------------------------------------------

export type QualificationStatus =
  | "qualified"
  | "possible_fit"
  | "not_qualified"
  | "insufficient_information";

export interface LeadQualification {
  status: QualificationStatus;
  score: number;
  matchedCriteria: string[];
  missingCriteria: string[];
  exclusionReasons: string[];
}

// --- Limits -----------------------------------------------------------------

export const MAX_COMPANY_QUERIES = 10;
export const MAX_RESULTS_PER_COMPANY_QUERY = 8;
export const MAX_CANDIDATE_PAGES = 80;
export const MAX_DETAILED_CANDIDATES = 40;
export const MAX_LEADS_IN_DELIVERABLE = 50;
export const MAX_SOURCE_CHARS_PER_PAGE = 6000;

/** How short a list may be before the run counts as a failure rather than a
 *  partial result. Set low on purpose: twelve verified companies is a useful
 *  answer to a request for twenty, and padding it would not be. */
export const MIN_LEAD_RATIO = 0.3;
export const MIN_LEAD_COUNT = 3;

export function meetsMinimumLeadCount(
  found: number,
  requested: number,
  /** Work done for a colleague clears a lower bar. They are writing their own
   *  deliverable and a single verified company they can name is worth more to
   *  them than being told the search came back empty. */
  forColleague = false,
): boolean {
  if (found === 0) return false;
  if (forColleague) return true;

  return found >= Math.min(MIN_LEAD_COUNT, requested) ||
    found >= Math.ceil(requested * MIN_LEAD_RATIO);
}

// --- Steps ------------------------------------------------------------------

export const LEAD_RESEARCH_STEPS = [
  "context_loaded",
  "lead_plan_created",
  "company_discovery",
  "company_validation",
  "contact_role_research",
  "lead_scoring",
  "evidence_validation",
  "deliverable_generation",
  "submitting",
  "completed",
] as const;

export type LeadResearchStep = (typeof LEAD_RESEARCH_STEPS)[number];

/** What the manager sees. Never "scraping", "enrichment" or "extraction". */
export const leadResearchStepLabel: Record<string, string> = {
  context_loaded: "Reviewing your ideal customer profile",
  lead_plan_created: "Planning the search",
  company_discovery: "Finding potential companies",
  company_validation: "Checking company fit",
  contact_role_research: "Identifying relevant buyer roles",
  lead_scoring: "Prioritizing leads",
  evidence_validation: "Checking lead information",
  deliverable_generation: "Preparing the lead list",
  submitting: "Submitting for review",
  completed: "Completed",
};

export const fitLabelText: Record<FitLabel, string> = {
  strong_fit: "Strong Fit",
  good_fit: "Good Fit",
  possible_fit: "Possible Fit",
};
