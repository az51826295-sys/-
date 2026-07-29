// Kept free of server imports so client components can share these definitions.

export const POLICY_CATEGORIES = [
  "brand",
  "sales",
  "research",
  "review",
  "security",
  "operations",
  "custom",
] as const;

export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

export const POLICY_PRIORITIES = ["required", "recommended", "optional"] as const;

export type PolicyPriority = (typeof POLICY_PRIORITIES)[number];

export type PolicyStatus = "active" | "draft" | "archived";

/** How a failed rule reaches the manager. */
export type FindingSeverity =
  | "blocking" /** A required rule with a check that failed. Approval waits. */
  | "warning" /** A recommended rule that failed. Worth a look, not a block. */
  | "note" /** An optional rule that failed. */
  | "manual"; /** A required rule nobody can check for free — the manager judges. */

export interface PolicyRule {
  id: string;
  title: string;
  instruction: string;
  priority: PolicyPriority;
  enabled: boolean;
  /** Names a check in the registry. Absent means only a person can judge it. */
  checkId: string | null;
  checkConfig: Record<string, unknown>;
  position: number;
}

export interface Policy {
  id: string;
  name: string;
  category: PolicyCategory;
  description: string;
  status: PolicyStatus;
  version: number;
  updatedAt: string;
  rules: PolicyRule[];
  /** Empty means the policy applies to the whole company. */
  departmentIds: string[];
}

/**
 * The standard one piece of work was actually held to.
 *
 * Written once when the work starts and never updated. Editing a policy
 * afterwards changes what the next assignment must meet, not what this one was
 * judged against.
 */
export interface PolicySnapshot {
  capturedAt: string;
  policies: {
    id: string;
    name: string;
    category: PolicyCategory;
    version: number;
    rules: PolicyRule[];
  }[];
}

export interface PolicyFinding {
  policyId: string | null;
  policyName: string;
  ruleId: string | null;
  ruleTitle: string;
  priority: PolicyPriority;
  severity: FindingSeverity;
  detail: string;
}

// --- Limits --------------------------------------------------------------

export const POLICY_NAME_MAX = 80;
export const POLICY_DESCRIPTION_MAX = 500;
export const RULE_TITLE_MAX = 120;
export const RULE_INSTRUCTION_MIN = 5;
export const RULE_INSTRUCTION_MAX = 500;
export const MAX_RULES_PER_POLICY = 30;

// --- Presentation --------------------------------------------------------

export const policyCategoryLabel: Record<PolicyCategory, string> = {
  brand: "Brand",
  sales: "Sales",
  research: "Research",
  review: "Review",
  security: "Security",
  operations: "Operations",
  custom: "Custom",
};

export const policyCategoryDescription: Record<PolicyCategory, string> = {
  brand: "How the company sounds and what it will not claim.",
  sales: "Who the company sells to, and how.",
  research: "What counts as evidence here.",
  review: "What every piece of work must contain before you see it.",
  security: "What must never appear in work that leaves the company.",
  operations: "How the company runs its day to day.",
  custom: "Standards of your own that don't fit the others.",
};

export const policyPriorityLabel: Record<PolicyPriority, string> = {
  required: "Required",
  recommended: "Recommended",
  optional: "Optional",
};

export const policyPriorityHint: Record<PolicyPriority, string> = {
  required: "Work that fails this can't be approved.",
  recommended: "Flagged for you, but doesn't hold anything up.",
  optional: "Noted where it applies.",
};

export const policyStatusLabel: Record<PolicyStatus, string> = {
  active: "Active",
  draft: "Draft",
  archived: "Archived",
};

export const findingSeverityLabel: Record<FindingSeverity, string> = {
  blocking: "Must be fixed",
  warning: "Worth checking",
  note: "Noted",
  manual: "For you to judge",
};

export const findingSeverityClass: Record<FindingSeverity, string> = {
  blocking: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-800",
  note: "bg-zinc-100 text-zinc-600",
  manual: "bg-blue-50 text-blue-700",
};

/** Required first: it is the one a manager cannot ignore. */
export const priorityRank: Record<PolicyPriority, number> = {
  required: 0,
  recommended: 1,
  optional: 2,
};

export const severityRank: Record<FindingSeverity, number> = {
  blocking: 0,
  manual: 1,
  warning: 2,
  note: 3,
};
