import { z } from "zod";
import { organizationCandidateSchema } from "@/lib/knowledge/types";

export const MEMORY_CATEGORIES = [
  "company_fact",
  "manager_preference",
  "work_pattern",
  "research_insight",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export type MemoryStatus = "active" | "pending_review" | "archived" | "rejected";

export const MEMORY_SOURCE_TYPES = [
  "deliverable",
  "deliverable_review",
  "research_source",
  "revision_request",
] as const;

// The lengths asked for in the extraction prompt. A memory is replayed into
// every future assignment, so it has to stay small.
export const TITLE_MAX = 140;
export const CONTENT_MAX = 700;
export const REASON_MAX = 500;

// What the validator actually enforces. The gap is deliberate: asked for 700
// characters the model lands within a percent or two of it, and throwing away
// a good lesson for running eight characters over is a worse outcome than
// storing eight extra characters. Beyond this it isn't overshoot, it's an essay.
export const TITLE_HARD_MAX = 180;
export const CONTENT_HARD_MAX = 900;

export const MAX_CANDIDATES = 10;

/** Per-category ceilings, so one assignment can't flood the employee's memory. */
export const CANDIDATE_CAPS: Record<MemoryCategory, number> = {
  manager_preference: 3,
  work_pattern: 3,
  company_fact: 2,
  research_insight: 4,
};

/** How long a lesson stays trustworthy without reconfirmation. A preference
 *  doesn't expire; a fact about a competitor's pricing does. */
export const VALIDITY_DAYS: Record<MemoryCategory, number | null> = {
  manager_preference: null,
  work_pattern: null,
  company_fact: 180,
  research_insight: 90,
};

export const memoryCandidateSchema = z.object({
  category: z.enum(MEMORY_CATEGORIES),
  title: z.string(),
  content: z.string(),
  reason: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  sourceType: z.enum([
    "manager_feedback",
    "approved_deliverable",
    "research_source",
    "revision_summary",
  ]),
  sourceReferences: z.array(
    z.object({
      type: z.enum(MEMORY_SOURCE_TYPES),
      id: z.string(),
    }),
  ),
});

export type MemoryCandidate = z.infer<typeof memoryCandidateSchema>;

/**
 * One call, two questions.
 *
 * What this employee should carry forward, and — separately, and much more
 * rarely — what the whole company should. Asking both here rather than in a
 * second call matters more than it looks: the expensive part of this request is
 * the deliverable, the reviews and the sources, and a second call would pay for
 * all of it again to ask a question the model is already holding the evidence
 * for.
 */
export const learningOutputSchema = z.object({
  candidates: z.array(memoryCandidateSchema),
  organizationCandidates: z.array(organizationCandidateSchema),
});

export type LearningOutput = z.infer<typeof learningOutputSchema>;

export type CandidateDecision = "created" | "merged" | "pending_review" | "rejected";

export type ConflictType =
  | "knowledge_conflict"
  | "memory_conflict"
  | "source_conflict"
  | "time_sensitive_change";

export type LearningErrorCode =
  | "LEARNING_CONTEXT_INCOMPLETE"
  | "LEARNING_EXTRACTION_FAILED"
  | "LEARNING_SAVE_FAILED";

export const learningErrorCopy: Record<LearningErrorCode, string> = {
  LEARNING_CONTEXT_INCOMPLETE:
    "completed the assignment, but couldn't gather what was needed to learn from it.",
  LEARNING_EXTRACTION_FAILED:
    "completed the assignment, but couldn't save new learning from it.",
  LEARNING_SAVE_FAILED:
    "completed the assignment, but couldn't save new learning from it.",
};

/** Labels the manager reads. Never "vector", "embedding" or "retrieval". */
export const memoryCategoryLabel: Record<MemoryCategory, string> = {
  company_fact: "Company Insight",
  manager_preference: "Manager Preference",
  work_pattern: "Work Approach",
  research_insight: "Research Insight",
};

// --- Retrieval -------------------------------------------------------------

export const MAX_MEMORIES_PER_EXECUTION = 12;

export const RETRIEVAL_CAPS: Record<MemoryCategory, number> = {
  manager_preference: 4,
  work_pattern: 4,
  company_fact: 4,
  research_insight: 6,
};

export const MAX_APPLIED_MEMORIES = 8;
