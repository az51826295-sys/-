import { z } from "zod";

export const SOURCE_TYPES = [
  "official_website",
  "official_pricing",
  "official_documentation",
  "official_announcement",
  "regulatory_filing",
  "reputable_publication",
  "review_platform",
] as const;

export const MIN_SEARCH_QUERIES = 3;
export const MAX_SEARCH_QUERIES = 8;
export const MAX_QUESTIONS = 8;
export const MAX_QUERY_LENGTH = 150;
export const MAX_RESULTS_PER_QUERY = 5;
export const MAX_CANDIDATE_SOURCES = 30;
export const MAX_SELECTED_SOURCES = 12;
export const MAX_SOURCE_CHARS = 10_000;

export const researchPlanSchema = z.object({
  objective: z.string(),
  questions: z.array(z.string()),
  searchQueries: z.array(z.string()),
  preferredSourceTypes: z.array(z.enum(SOURCE_TYPES)),
});

export type ResearchPlan = z.infer<typeof researchPlanSchema>;

export const deliverableSectionSchema = z.object({
  heading: z.string(),
  content: z.string(),
  /** Research source ids only — the server turns these into numbered links. */
  citations: z.array(z.string()),
});

export const deliverableOutputSchema = z.object({
  title: z.string(),
  executiveSummary: z.string(),
  sections: z.array(deliverableSectionSchema),
  keyImplications: z.array(z.string()),
  recommendedNextSteps: z.array(z.string()),
  limitations: z.array(z.string()),
  /** Ids of the remembered lessons this work actually followed. Empty is a
   *  valid answer; the server drops any id it didn't supply. */
  appliedMemoryIds: z.array(z.string()),
});

export type DeliverableOutput = z.infer<typeof deliverableOutputSchema>;

// --- Revision -------------------------------------------------------------

export const CHANGE_TYPES = [
  "add",
  "remove",
  "rewrite",
  "expand",
  "clarify",
  "correct",
  "strengthen_evidence",
] as const;

export const MAX_REVISION_QUERIES = 5;
export const MAX_REVISION_SOURCES = 8;
/** Ceiling on evidence carried into a revision, so repeated retries don't grow
 *  the context without bound. Cited sources are kept first. */
export const MAX_REUSED_SOURCES = 14;
/** Version 1 plus this many revisions. */
export const MAX_REVISIONS_PER_ASSIGNMENT = 3;

export const feedbackAnalysisSchema = z.object({
  feedbackSummary: z.string(),
  requiredChanges: z.array(
    z.object({
      section: z.string(),
      changeType: z.enum(CHANGE_TYPES),
      instruction: z.string(),
    }),
  ),
  additionalResearchRequired: z.boolean(),
  researchQuestions: z.array(z.string()),
  searchQueries: z.array(z.string()),
});

export type FeedbackAnalysis = z.infer<typeof feedbackAnalysisSchema>;

export const revisedDeliverableOutputSchema = z.object({
  title: z.string(),
  executiveSummary: z.string(),
  sections: z.array(deliverableSectionSchema),
  keyImplications: z.array(z.string()),
  recommendedNextSteps: z.array(z.string()),
  limitations: z.array(z.string()),
  revisionSummary: z.array(
    z.object({
      change: z.string(),
      reason: z.string(),
      section: z.string(),
    }),
  ),
});

export type RevisedDeliverableOutput = z.infer<typeof revisedDeliverableOutputSchema>;

/** Checked by a separate model call, so the revision cannot mark its own homework. */
export const revisionValidationSchema = z.object({
  passed: z.boolean(),
  addressedChanges: z.array(z.string()),
  missingChanges: z.array(z.string()),
});

export type RevisionValidation = z.infer<typeof revisionValidationSchema>;

export type RevisionErrorCode =
  | "REVISION_CONTEXT_INCOMPLETE"
  | "FEEDBACK_ANALYSIS_FAILED"
  | "REVISION_RESEARCH_FAILED"
  | "MODEL_REVISION_FAILED"
  | "REVISION_CITATION_FAILED"
  | "REVISION_INCOMPLETE"
  | "REVISION_CHECK_UNAVAILABLE"
  | "REVISION_SAVE_FAILED";

export const revisionErrorCopy: Record<RevisionErrorCode, string> = {
  REVISION_CONTEXT_INCOMPLETE: "couldn't load everything needed to revise this work.",
  FEEDBACK_ANALYSIS_FAILED: "couldn't fully understand the requested changes.",
  REVISION_RESEARCH_FAILED:
    "couldn't find enough reliable information to complete the requested revision.",
  MODEL_REVISION_FAILED: "encountered a problem while revising the deliverable.",
  REVISION_CITATION_FAILED: "couldn't verify the evidence behind the revised deliverable.",
  REVISION_INCOMPLETE: "couldn't cover everything you asked for in this revision.",
  REVISION_CHECK_UNAVAILABLE:
    "revised the deliverable, but couldn't confirm it covered your feedback.",
  REVISION_SAVE_FAILED:
    "completed the revision, but the revised deliverable could not be submitted.",
};

export const REVISION_STEPS = [
  "revision_context_loaded",
  "feedback_analyzing",
  "revision_planning",
  "additional_research",
  "revision_drafting",
  "citation_validation",
  "feedback_validation",
  "resubmitting",
  "completed",
] as const;

export type RevisionStep = (typeof REVISION_STEPS)[number];

export const revisionStepLabel: Record<RevisionStep, string> = {
  revision_context_loaded: "Reviewing your feedback",
  feedback_analyzing: "Understanding requested changes",
  revision_planning: "Planning the revision",
  additional_research: "Researching additional evidence",
  revision_drafting: "Revising the deliverable",
  citation_validation: "Checking evidence",
  feedback_validation: "Checking requested changes",
  resubmitting: "Preparing the revised deliverable",
  completed: "Submitted for review",
};

export interface ResearchSourceForPrompt {
  id: string;
  title: string;
  url: string;
  publishedAt?: string;
  fetchStatus: string;
  content: string;
}

export type ExecutionErrorCode =
  /** 실패가 아니다 — 계획을 보이고 사장님 확인을 기다린다(되묻기, 35회차). 상태표가 잠겨 있어 이 칸을 빌린다. */
  | "WAITING_APPROVAL"
  | "CONTEXT_INCOMPLETE"
  | "MODEL_PLAN_FAILED"
  | "INVALID_RESEARCH_PLAN"
  | "SEARCH_FAILED"
  | "NO_RELEVANT_SOURCES"
  | "SOURCE_FETCH_FAILED"
  | "MODEL_DELIVERABLE_FAILED"
  | "INVALID_DELIVERABLE_OUTPUT"
  | "CITATION_VALIDATION_FAILED"
  /** Creation work that contradicted itself — a rule naming a colour the
   *  palette does not contain, a file count that disagrees with its own list.
   *  Distinct from a citation failure because there is nothing to verify
   *  against; the document simply does not hold together. */
  | "SELF_INCONSISTENT"
  | "DELIVERABLE_SAVE_FAILED"
  | "SPEND_LIMIT_REACHED"
  | "UNKNOWN_ERROR";

/** What the user reads when an execution fails. Never a stack trace. */
export const executionErrorCopy: Record<ExecutionErrorCode, string> = {
  WAITING_APPROVAL: "is showing the plan and waiting for the manager's go-ahead.",
  CONTEXT_INCOMPLETE:
    "needs more company information before starting this assignment.",
  MODEL_PLAN_FAILED: "couldn't plan the research for this assignment.",
  INVALID_RESEARCH_PLAN: "couldn't plan the research for this assignment.",
  SEARCH_FAILED: "couldn't reach the research sources needed for this assignment.",
  NO_RELEVANT_SOURCES:
    "couldn't find enough reliable public information for this assignment.",
  SOURCE_FETCH_FAILED:
    "couldn't read enough of the sources found for this assignment.",
  MODEL_DELIVERABLE_FAILED:
    "encountered a problem while preparing the deliverable.",
  INVALID_DELIVERABLE_OUTPUT:
    "encountered a problem while preparing the deliverable.",
  CITATION_VALIDATION_FAILED:
    "couldn't verify the evidence behind the deliverable.",
  // Says what went wrong rather than that something did, because this one the
  // manager can actually act on: a brief that left the important things open
  // is what usually produces a document that argues with itself.
  SELF_INCONSISTENT:
    "produced a specification that contradicted itself, and stopped rather than hand over something later work would be checked against.",
  DELIVERABLE_SAVE_FAILED:
    "finished the assignment, but the deliverable could not be submitted.",
  // Written as the account's state rather than the employee's failing: nobody
  // did anything wrong here, and blaming the employee for a budget would be a
  // small lie the manager has to see through.
  SPEND_LIMIT_REACHED:
    "couldn't start — this account has reached its spending allowance.",
  UNKNOWN_ERROR: "encountered a problem while completing this assignment.",
};

export const EXECUTION_STEPS = [
  "context_loaded",
  "research_planning",
  "searching",
  "fetching_sources",
  "analyzing",
  "drafting",
  "validating_citations",
  "submitting",
  "completed",
] as const;

export type ExecutionStep = (typeof EXECUTION_STEPS)[number];

/** Internal step names never reach the screen — these do. */
export const executionStepLabel: Record<ExecutionStep, string> = {
  context_loaded: "Understanding the assignment",
  research_planning: "Planning the research",
  searching: "Researching sources",
  fetching_sources: "Reading sources",
  analyzing: "Analyzing findings",
  drafting: "Preparing the deliverable",
  validating_citations: "Checking evidence",
  submitting: "Submitting for review",
  completed: "Submitted for review",
};
