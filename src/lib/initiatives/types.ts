import { z } from "zod";

export type InitiativeStatus =
  | "new"
  | "approved"
  | "dismissed"
  | "expired"
  | "completed";

export type InitiativePriority = "low" | "normal" | "high" | "critical";
export type InitiativeConfidence = "low" | "medium" | "high";

export const OBSERVATION_KINDS = [
  "product_launch",
  "pricing_change",
  "funding",
  "acquisition",
  "expansion",
  "hiring",
  "positioning_change",
  "market_trend",
  "new_company",
  "other",
] as const;

export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

/**
 * What an employee may propose.
 *
 * The model writes the case for doing the work and the assignment it would
 * become, but never the evidence itself: it cites observation ids, and the
 * server turns those into titles and URLs. A proposal is only as good as the
 * page behind it, and a page the model invented is not one.
 */
export const proposedInitiativeSchema = z.object({
  /** What was noticed, as a headline. */
  title: z.string(),
  /** What the employee observed, in plain sentences. */
  summary: z.string(),
  /** What they propose to do about it. */
  recommendation: z.string(),
  /** Why it is worth the company's time. */
  reasoning: z.string(),
  kind: z.enum(OBSERVATION_KINDS),
  priority: z.enum(["low", "normal", "high", "critical"]),
  /** The employee's own read on how solid this is. Tempered server-side by how
   *  much evidence actually backs it. */
  confidence: z.enum(["low", "medium", "high"]),
  /** Identifies the event, not the wording: "intercom-ai-inbox-launch". */
  signalKey: z.string(),
  /** Ids from the observation list. Anything else is dropped. */
  observationIds: z.array(z.string()),
  /** The work itself, ready for the manager to approve as-is. */
  assignmentTitle: z.string(),
  assignmentDescription: z.string(),
  assignmentExpectedOutcome: z.string(),
});

export type ProposedInitiative = z.infer<typeof proposedInitiativeSchema>;

export const initiativeDetectionSchema = z.object({
  proposals: z.array(proposedInitiativeSchema),
  /** Said explicitly so "nothing worth raising" is a real answer rather than a
   *  gap the employee feels obliged to fill. */
  nothingNoteworthy: z.boolean(),
});

export interface InitiativeEvidence {
  observationId: string;
  title: string;
  url: string;
  domain: string;
  publishedAt?: string;
  kind: ObservationKind;
}

export interface AssignmentSnapshot {
  title: string;
  description: string;
  expectedOutcome: string;
  priority: InitiativePriority;
}

export interface InitiativeRow {
  id: string;
  company_id: string;
  company_employee_id: string;
  detection_run_id: string | null;
  title: string;
  summary: string;
  recommendation: string;
  reasoning: string;
  status: InitiativeStatus;
  priority: InitiativePriority;
  confidence: InitiativeConfidence;
  confidence_score: number;
  evidence_json: InitiativeEvidence[];
  assignment_snapshot: AssignmentSnapshot;
  role_input_json: unknown;
  role_input_schema_id: string | null;
  dedupe_key: string;
  assignment_id: string | null;
  expires_at: string | null;
  approved_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

// --- Limits -----------------------------------------------------------------

export const MAX_OBSERVATION_QUERIES = 6;
export const MAX_RESULTS_PER_OBSERVATION_QUERY = 6;
export const MAX_OBSERVATIONS = 30;
export const MAX_OBSERVATION_CHARS = 4000;

/** Few and good. An inbox of fifteen suggestions is an inbox nobody reads, and
 *  the employee should be choosing what matters rather than listing options. */
export const MAX_PROPOSALS_PER_RUN = 3;

/** How long a dismissed signal stays buried. Long enough that the manager is
 *  not asked twice about the same thing, short enough that a genuinely changed
 *  situation can be raised again. */
export const DISMISSED_SIGNAL_COOLDOWN_DAYS = 30;

/** An unanswered proposal about a moving market goes stale. */
export const INITIATIVE_EXPIRY_DAYS = 21;

export const MIN_EVIDENCE_PER_INITIATIVE = 1;

// --- Presentation -----------------------------------------------------------

export const confidenceLabel: Record<InitiativeConfidence, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

export const confidenceClass: Record<InitiativeConfidence, string> = {
  low: "bg-zinc-100 text-zinc-600",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-green-50 text-green-700",
};

export const priorityLabel: Record<InitiativePriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Urgent",
};

export const initiativeStatusLabel: Record<InitiativeStatus, string> = {
  new: "Waiting for you",
  approved: "Approved",
  dismissed: "Dismissed",
  expired: "Expired",
  completed: "Completed",
};

/** What the manager reads about the kind of thing that was spotted. Never
 *  "signal", never "detection". */
export const observationKindLabel: Record<ObservationKind, string> = {
  product_launch: "Product launch",
  pricing_change: "Pricing change",
  funding: "Funding",
  acquisition: "Acquisition",
  expansion: "Expansion",
  hiring: "Hiring",
  positioning_change: "Positioning change",
  market_trend: "Market trend",
  new_company: "New companies",
  other: "Other",
};

export type DetectionErrorCode =
  | "EMPLOYEE_NOT_READY"
  | "NO_OBSERVATIONS"
  | "DETECTION_FAILED"
  | "DETECTOR_NOT_FOUND";

export const detectionErrorCopy: Record<DetectionErrorCode, string> = {
  EMPLOYEE_NOT_READY: "needs to finish onboarding before looking for opportunities.",
  NO_OBSERVATIONS: "couldn't find anything to review this time.",
  DETECTION_FAILED: "ran into a problem while looking for opportunities.",
  DETECTOR_NOT_FOUND: "isn't set up to look for opportunities yet.",
};
