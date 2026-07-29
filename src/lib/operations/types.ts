import { z } from "zod";

export type CycleStatus =
  | "planning"
  | "active"
  | "review"
  | "completed"
  | "archived";

export type ReviewStatus = "pending" | "ready" | "approved" | "dismissed";

// --- The operating plan --------------------------------------------------

export const operatingPlanSchema = z.object({
  /** How the objective breaks down, addressed to the manager. */
  summary: z.string(),
  phases: z.array(
    z.object({
      name: z.string(),
      /** What this phase is for, in one or two sentences. */
      intent: z.string(),
      /** Departments that carry it. Named, so the plan is answerable by the
       *  organisation that exists rather than an idealised one. */
      departments: z.array(z.string()),
      /** Whether this phase can begin now or waits on an earlier one. */
      startsAfter: z.string(),
    }),
  ),
  /** The first piece of work worth doing, as a project goal the manager could
   *  approve. One, not a backlog — the point is the next step. */
  firstProject: z.object({
    title: z.string(),
    goal: z.string(),
    expectedOutcome: z.string(),
    reasoning: z.string(),
  }),
  risks: z.array(z.string()),
  /** Set when the objective needs skills the company does not have. */
  cannotPlan: z.boolean(),
  cannotPlanReason: z.string(),
});

export type OperatingPlan = z.infer<typeof operatingPlanSchema>;

// --- The review ----------------------------------------------------------

export const recommendationSchema = z.object({
  /** What to do, phrased as something the manager can say yes or no to. */
  title: z.string(),
  reasoning: z.string(),
  /** Filled in only when the recommendation is to run a piece of work, so
   *  approving it has something concrete to become. */
  projectGoal: z.string(),
  projectOutcome: z.string(),
  priority: z.enum(["low", "normal", "high"]),
  /** Whether this needs the manager to do something themselves — review a
   *  deliverable, hire someone — rather than start work. */
  needsManagerAction: z.boolean(),
});

export const operatingReviewSchema = z.object({
  /** Where the cycle actually stands, in the manager's terms. */
  summary: z.string(),
  /** What is holding things up. Empty when nothing is. */
  blockers: z.array(z.string()),
  recommendations: z.array(recommendationSchema),
  /** Set when the cycle's objective looks met. The manager still closes it. */
  objectiveLooksMet: z.boolean(),
});

export type Recommendation = z.infer<typeof recommendationSchema>;
export type OperatingReview = z.infer<typeof operatingReviewSchema>;

// --- Limits --------------------------------------------------------------

export const MAX_PHASES = 6;
export const MAX_RECOMMENDATIONS = 4;
export const CYCLE_NAME_MAX = 80;
export const OBJECTIVE_MIN = 20;
export const OBJECTIVE_MAX = 2000;

// --- Presentation --------------------------------------------------------

export const cycleStatusLabel: Record<CycleStatus, string> = {
  planning: "Getting ready",
  active: "Active",
  review: "Under review",
  completed: "Completed",
  archived: "Archived",
};

export const cycleStatusClass: Record<CycleStatus, string> = {
  planning: "bg-blue-50 text-blue-700",
  active: "bg-green-50 text-green-700",
  review: "bg-amber-50 text-amber-700",
  completed: "bg-zinc-100 text-zinc-600",
  archived: "bg-zinc-100 text-zinc-500",
};

export type CycleFailureCode =
  | "NO_ORGANIZATION"
  | "PLANNING_FAILED"
  | "CANNOT_PLAN"
  | "REVIEW_FAILED";

export const cycleFailureCopy: Record<CycleFailureCode, string> = {
  NO_ORGANIZATION:
    "Hire and train at least one employee before starting an operation.",
  PLANNING_FAILED: "The operating plan couldn't be prepared.",
  CANNOT_PLAN: "This objective needs skills nobody here has yet.",
  REVIEW_FAILED: "The review couldn't be completed.",
};
