import { z } from "zod";

// Kept free of server imports so client components can share these definitions.

export const KNOWLEDGE_CATEGORIES = [
  "best_practice",
  "quality_improvement",
  "research_finding",
  "process_improvement",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export type CandidateStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "needs_revision";

export type KnowledgeStatus = "draft" | "active" | "deprecated" | "archived";

/**
 * Something one piece of work suggests the whole company should know.
 *
 * Proposed by the same extraction that produces the employee's own lessons, and
 * deliberately harder to earn: a lesson only that employee needs is a memory,
 * and calling it company knowledge would spread one person's habit to everybody
 * on the strength of a single afternoon.
 */
export const organizationCandidateSchema = z.object({
  title: z.string(),
  /** What the company should do differently, in one or two sentences. */
  summary: z.string(),
  /** Why this belongs to the company rather than to the person who found it. */
  reason: z.string(),
  category: z.enum(KNOWLEDGE_CATEGORIES),
  confidence: z.enum(["low", "medium", "high"]),
});

export type OrganizationCandidate = z.infer<typeof organizationCandidateSchema>;

// Company knowledge reaches every employee on every assignment, so it has to be
// shorter than a memory, not longer.
export const KNOWLEDGE_TITLE_MAX = 140;
export const KNOWLEDGE_SUMMARY_MAX = 500;
export const KNOWLEDGE_TITLE_HARD_MAX = 180;
export const KNOWLEDGE_SUMMARY_HARD_MAX = 700;

/** Per approved deliverable. Two is a good outcome; most produce none. */
export const MAX_ORGANIZATION_CANDIDATES = 3;

/** How much of the company's knowledge reaches one piece of work. */
export const MAX_KNOWLEDGE_PER_EXECUTION = 8;

export const knowledgeCategoryLabel: Record<KnowledgeCategory, string> = {
  best_practice: "Best Practice",
  quality_improvement: "Quality Standard",
  research_finding: "Research Finding",
  process_improvement: "Process Improvement",
};

export const knowledgeCategoryHint: Record<KnowledgeCategory, string> = {
  best_practice: "Something that worked, worth doing again.",
  quality_improvement: "A bar the company's work should meet.",
  research_finding: "Something true about the world the company sells into.",
  process_improvement: "A better order or method for getting work done.",
};

export const candidateStatusLabel: Record<CandidateStatus, string> = {
  pending: "Waiting on you",
  approved: "Adopted",
  rejected: "Turned down",
  needs_revision: "Sent back",
};

export const candidateStatusClass: Record<CandidateStatus, string> = {
  pending: "bg-amber-50 text-amber-800",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-zinc-100 text-zinc-500",
  needs_revision: "bg-blue-50 text-blue-700",
};

export const knowledgeStatusLabel: Record<KnowledgeStatus, string> = {
  draft: "Draft",
  active: "In effect",
  deprecated: "No longer holds",
  archived: "Archived",
};

export const confidenceLabel: Record<string, string> = {
  low: "Thin evidence",
  medium: "Reasonable evidence",
  high: "Strong evidence",
};
