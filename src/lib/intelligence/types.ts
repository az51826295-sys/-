// Kept free of server imports so client components can share these definitions.

export const INSIGHT_CATEGORIES = [
  "capacity",
  "quality",
  "throughput",
  "review",
  "learning",
] as const;

export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export const RECOMMENDATION_CATEGORIES = [
  "capacity",
  "hiring",
  "playbook",
  "department",
  "project",
  "review",
  "learning",
] as const;

export type RecommendationCategory =
  (typeof RECOMMENDATION_CATEGORIES)[number];

export type RecommendationStatus =
  | "new"
  | "reviewing"
  | "approved"
  | "dismissed"
  | "completed";

export type ActionType =
  | "open_hiring"
  | "review_playbook"
  | "review_queue"
  | "review_learning"
  | "review_deliverables"
  | "open_department"
  | "none";

export interface Insight {
  id: string;
  category: InsightCategory;
  title: string;
  summary: string;
  measurements: Record<string, number | string>;
  severity: Severity;
  signalKey: string;
  subjectType: "company" | "department" | "employee" | "playbook";
  subjectId: string | null;
  observedAt: string;
}

export interface Recommendation {
  id: string;
  insightId: string | null;
  category: RecommendationCategory;
  title: string;
  description: string;
  reasoning: string;
  priority: number;
  status: RecommendationStatus;
  signalKey: string;
  action: { type: ActionType; payload: Record<string, unknown> } | null;
  createdAt: string;
}

/**
 * How cheap the fix is, and therefore what order to offer them in.
 *
 * A real company moves work around before it borrows people, borrows before it
 * rewrites how it works, and hires last — because hiring is the only one of
 * these with a bill attached every month afterwards. Numbers rather than an
 * enum so a new kind of suggestion can slot between two existing ones.
 */
export const RECOMMENDATION_PRIORITY = {
  redistribute_work: 10,
  cross_department_support: 20,
  improve_playbook: 30,
  review_backlog: 35,
  optimize_schedule: 40,
  hire_employee: 90,
} as const;

export const severityRank: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export const severityLabel: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "For information",
};

export const severityClass: Record<Severity, string> = {
  critical: "bg-red-50 text-red-700",
  high: "bg-amber-50 text-amber-800",
  medium: "bg-blue-50 text-blue-700",
  low: "bg-zinc-100 text-zinc-600",
  info: "bg-zinc-100 text-zinc-500",
};

export const insightCategoryLabel: Record<InsightCategory, string> = {
  capacity: "Capacity",
  quality: "Quality",
  throughput: "Throughput",
  review: "Review",
  learning: "Learning",
};

export const recommendationCategoryLabel: Record<RecommendationCategory, string> = {
  capacity: "Move work around",
  hiring: "Hire someone",
  playbook: "Change how the work is done",
  department: "Change the organisation",
  project: "Projects",
  review: "Your review queue",
  learning: "Learning",
};

export const recommendationStatusLabel: Record<RecommendationStatus, string> = {
  new: "Waiting on you",
  reviewing: "Looking into it",
  approved: "Accepted",
  dismissed: "Turned down",
  completed: "Done",
};

/**
 * How the company is doing overall, in one word.
 *
 * Derived from the worst thing standing rather than from an average. An average
 * would let one department drowning be cancelled out by another being fine,
 * which is exactly the situation a manager needs told about.
 */
export type Health = "healthy" | "watch" | "strained" | "unknown";

export const healthLabel: Record<Health, string> = {
  healthy: "Healthy",
  watch: "Worth watching",
  strained: "Under strain",
  unknown: "Not enough history",
};

export const healthClass: Record<Health, string> = {
  healthy: "bg-green-50 text-green-700",
  watch: "bg-amber-50 text-amber-800",
  strained: "bg-red-50 text-red-700",
  unknown: "bg-zinc-100 text-zinc-500",
};

export function healthFrom(insights: { severity: Severity }[]): Health {
  if (insights.length === 0) return "unknown";
  if (insights.some((i) => i.severity === "critical" || i.severity === "high")) {
    return "strained";
  }
  if (insights.some((i) => i.severity === "medium")) return "watch";
  return "healthy";
}
