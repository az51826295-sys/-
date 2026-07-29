import { z } from "zod";

export type ProjectStatus =
  | "draft"
  | "planning"
  | "plan_ready"
  | "working"
  | "preparing_final_deliverable"
  | "awaiting_review"
  | "needs_changes"
  | "completed"
  | "failed"
  | "cancelled";

export type WorkItemStatus =
  | "planned"
  | "ready"
  | "blocked"
  | "queued"
  | "working"
  | "awaiting_internal_review"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped";

// --- The plan -----------------------------------------------------------

export const dependencyInputSchema = z.object({
  dependencyClientId: z.string(),
  inputType: z.enum([
    "deliverable_summary",
    "structured_output",
    "source_list",
    "selected_items",
  ]),
  description: z.string(),
});

export const planWorkItemSchema = z.object({
  /** The plan's own id for this item, used to express order before any of it
   *  exists in the database. */
  clientId: z.string(),
  title: z.string(),
  objective: z.string(),
  expectedOutcome: z.string(),
  /** Matched against what the company's employees actually declare. A skill
   *  nobody has is a rejected plan, not a reassigned one. */
  requiredSkillId: z.string(),
  recommendedCompanyEmployeeId: z.string(),
  /**
   * Why this person and not one of the others.
   *
   * The product asks the manager to accept that somebody else picked who does
   * their work. That is a reasonable thing to ask only if the reason is
   * visible — otherwise "Emma will do this" is indistinguishable from a coin
   * toss, and the manager's only way to disagree is to reject the whole plan.
   *
   * Asked for in the same call that makes the choice, because the reason is
   * already in the model's head at that moment and a second call would pay
   * again for something it is holding.
   */
  assigneeRationale: z.string(),
  priority: z.enum(["low", "normal", "high"]),
  executionMode: z.enum(["parallel", "after_dependencies"]),
  dependencyClientIds: z.array(z.string()),
  inputFromDependencies: z.array(dependencyInputSchema),
  /**
   * How much of this work the project needs, as key/value pairs.
   *
   * Flat strings rather than a per-skill object, because the shape differs by
   * employee and the plan is one schema. The server parses these against the
   * skill's own input schema, so a value the skill would reject never reaches
   * it.
   */
  roleInput: z.array(z.object({ key: z.string(), value: z.string() })),
  /** Optional work may fail without failing the project; the brief records
   *  what that leaves uncovered. */
  requiredForProjectCompletion: z.boolean(),
});

export const projectPlanSchema = z.object({
  projectSummary: z.string(),
  successCriteria: z.array(z.string()),
  workItems: z.array(planWorkItemSchema),
  finalDeliverable: z.object({
    title: z.string(),
    sections: z.array(z.string()),
  }),
  risks: z.array(z.string()),
  assumptions: z.array(z.string()),
  /** Set when the goal needs a skill nobody here has. Better than a plan that
   *  cannot be carried out. */
  cannotPlan: z.boolean(),
  cannotPlanReason: z.string(),
});

export type DependencyInput = z.infer<typeof dependencyInputSchema>;
export type PlanWorkItem = z.infer<typeof planWorkItemSchema>;
export type ProjectPlan = z.infer<typeof projectPlanSchema>;

// --- Contribution summaries and the brief --------------------------------

export const workItemSummarySchema = z.object({
  objective: z.string(),
  completedOutcome: z.string(),
  keyFindings: z.array(z.string()),
  recommendations: z.array(z.string()),
  /** Only ids that already exist on the member's own deliverable. */
  citationIds: z.array(z.string()),
});

export type WorkItemSummary = z.infer<typeof workItemSummarySchema>;

export const projectBriefSchema = z.object({
  title: z.string(),
  executiveSummary: z.string(),
  projectGoal: z.string(),
  keyFindings: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      supportingWorkItemIds: z.array(z.string()),
      citationIds: z.array(z.string()),
    }),
  ),
  employeeContributions: z.array(
    z.object({
      employeeName: z.string(),
      role: z.string(),
      workItemTitle: z.string(),
      summary: z.string(),
    }),
  ),
  recommendations: z.array(
    z.object({
      recommendation: z.string(),
      rationale: z.string(),
      priority: z.enum(["high", "normal", "low"]),
      supportingWorkItemIds: z.array(z.string()),
      citationIds: z.array(z.string()),
    }),
  ),
  actionPlan: z.array(
    z.object({
      action: z.string(),
      ownerSuggestion: z.string(),
      timing: z.string(),
      reason: z.string(),
    }),
  ),
  limitations: z.array(z.string()),
});

export type ProjectBrief = z.infer<typeof projectBriefSchema>;

// --- Revision ------------------------------------------------------------

export const revisionAnalysisSchema = z.object({
  /** Whether the members' work was wrong, or only how it was brought together.
   *  Re-running several employees costs real money, so the distinction is made
   *  deliberately rather than defaulted to the expensive answer. */
  revisionScope: z.enum(["final_merge_only", "work_items_and_merge"]),
  reasoning: z.string(),
  affectedWorkItemClientIds: z.array(z.string()),
  mergeInstructions: z.string(),
});

export type RevisionAnalysis = z.infer<typeof revisionAnalysisSchema>;

// --- Limits --------------------------------------------------------------

export const MIN_PROJECT_WORK_ITEMS = 1;
export const MAX_PROJECT_WORK_ITEMS = 6;
export const MAX_PROJECT_DEPENDENCY_DEPTH = 3;
export const MAX_EMPLOYEES_PER_PROJECT = 4;
export const MAX_ACTIVE_PROJECTS_PER_COMPANY = 5;
export const MAX_PROJECT_REVISIONS = 3;

export const GOAL_MIN = 20;
export const GOAL_MAX = 5000;
export const TITLE_MAX = 200;
export const OUTCOME_MAX = 3000;

// --- Presentation --------------------------------------------------------

export const projectStatusLabel: Record<ProjectStatus, string> = {
  draft: "Draft",
  planning: "Preparing the project plan",
  plan_ready: "Ready to start",
  working: "Your workforce is working",
  preparing_final_deliverable: "Preparing the final deliverable",
  awaiting_review: "Waiting for your review",
  needs_changes: "Revising the project",
  completed: "Completed",
  failed: "Needs attention",
  cancelled: "Cancelled",
};

export const projectStatusClass: Record<ProjectStatus, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  planning: "bg-blue-50 text-blue-700",
  plan_ready: "bg-blue-50 text-blue-700",
  working: "bg-blue-50 text-blue-700",
  preparing_final_deliverable: "bg-blue-50 text-blue-700",
  awaiting_review: "bg-amber-50 text-amber-700",
  needs_changes: "bg-amber-50 text-amber-700",
  completed: "bg-green-50 text-green-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-500",
};

export const workItemStatusLabel: Record<WorkItemStatus, string> = {
  planned: "Planned",
  ready: "Ready to start",
  blocked: "Waiting",
  queued: "Waiting to start",
  working: "Working",
  awaiting_internal_review: "Checking the work",
  completed: "Completed",
  failed: "Couldn't finish",
  cancelled: "Cancelled",
  skipped: "Skipped",
};

/** How far along each state counts as. Progress is arithmetic on these, not a
 *  number the model reports about itself. */
export const workItemProgressWeight: Record<WorkItemStatus, number> = {
  planned: 0,
  blocked: 0,
  ready: 10,
  queued: 10,
  working: 50,
  awaiting_internal_review: 80,
  completed: 100,
  failed: 0,
  cancelled: 0,
  skipped: 100,
};

export type ProjectFailureCode =
  | "NO_EMPLOYEES"
  | "NO_MATCHING_SKILL"
  | "PLANNING_FAILED"
  | "PLAN_INVALID"
  | "CANNOT_PLAN"
  | "REQUIRED_WORK_FAILED"
  | "FINAL_DELIVERABLE_FAILED"
  | "NEEDS_CHANGES"
  | "INTERNAL_ERROR";

/** What the manager reads. Never a code, and never a dependency-graph term. */
export const projectFailureCopy: Record<ProjectFailureCode, string> = {
  NO_EMPLOYEES: "No employees are ready to take on work for this.",
  NO_MATCHING_SKILL:
    "Your workforce does not currently have an employee with the skills this project needs.",
  PLANNING_FAILED: "The project plan couldn't be prepared. No work has started.",
  PLAN_INVALID: "The project plan couldn't be validated. No work has started.",
  CANNOT_PLAN: "This goal needs skills nobody here has yet.",
  REQUIRED_WORK_FAILED:
    "This project needs attention because a required assignment couldn't be completed.",
  FINAL_DELIVERABLE_FAILED:
    "Your workforce completed the assignments, but the final deliverable couldn't be prepared.",
  NEEDS_CHANGES: "You asked for changes to this project.",
  INTERNAL_ERROR: "Something went wrong running this project.",
};

export type PlanValidationCode =
  | "SCHEMA_INVALID"
  | "NO_WORK_ITEMS"
  | "TOO_MANY_WORK_ITEMS"
  | "TOO_MANY_EMPLOYEES"
  | "UNKNOWN_SKILL"
  | "UNKNOWN_EMPLOYEE"
  | "DEPENDENCY_NOT_FOUND"
  | "DEPENDENCY_SELF"
  | "DEPENDENCY_CYCLE"
  | "DEPENDENCY_DEPTH_EXCEEDED";
