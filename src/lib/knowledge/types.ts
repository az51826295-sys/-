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

/**
 * How much of the company's knowledge reaches one piece of work.
 * 8 → 16 (102회차 09-14): 활성 지식이 13개가 되자 최신순 상한 8이 확인된 규칙(LegacyRuntime.ttf, 09-05 '(규칙)' 셋)을 조용히
 * 잘라 내고 있었다. 한 줄이 100~200자라 16개여도 실행당 1,500자 안팎 — 일 하나 값에 비하면 작다. 자르는 순서는 retrieval.ts.
 */
/**
 * 228회차 10-01: 16 → 18. 되살린 규칙 중 **뜻으로 새것인 2개**를 넣을 자리다.
 * 재고 올렸다 — 지식 한 줄 ≈ 104 토큰, 2줄이면 모든 일마다 +208 토큰 ≈ 한 달 $0.04(하루 20판).
 * 함부로 더 올리지 마라: 이 수는 **모든 직원이 모든 일마다** 낸다. 그리고 같은 말이 두 줄이면
 * 둘 다 묽어진다 — 10-01 에 안 올라간 10개 중 8개가 이미 있는 말이었다(`rule_dup_check.mts`).
 * 자리가 모자라면 상한부터 올리지 말고 **겹치는 것부터 세라.**
 */
export const MAX_KNOWLEDGE_PER_EXECUTION = 18;

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
