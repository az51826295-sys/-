import type { EmployeeDefinition } from "@/lib/employees/definitions";
import type { OnboardingAnswer } from "@/lib/types";

/**
 * Builds the role-specific part of an employee's knowledge from their onboarding
 * answers.
 *
 * This is per-role on purpose. The questions are data, but turning "which
 * industries?" into an ideal customer profile is a decision about what that
 * role's knowledge means, and it belongs beside the schema that validates it —
 * not in the generic answer-saving code, which should stay ignorant of roles.
 */
export type RoleKnowledgeBuilder = (answers: Map<string, OnboardingAnswer>) => unknown;

function text(answers: Map<string, OnboardingAnswer>, id: string): string | null {
  const value = answers.get(id)?.answer_text;
  return value?.trim() ? value.trim() : null;
}

function list(answers: Map<string, OnboardingAnswer>, id: string): string[] {
  const value = answers.get(id)?.answer_json;
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function range(
  answers: Map<string, OnboardingAnswer>,
  id: string,
): { min?: number; max?: number } | undefined {
  const value = answers.get(id)?.answer_json as
    | { min?: unknown; max?: unknown }
    | undefined;
  if (!value || typeof value !== "object") return undefined;

  const min = typeof value.min === "number" ? value.min : undefined;
  const max = typeof value.max === "number" ? value.max : undefined;
  if (min === undefined && max === undefined) return undefined;
  return { min, max };
}

const builders: Record<string, RoleKnowledgeBuilder> = {
  market_research_knowledge_v1: (answers) => ({
    marketsToMonitor: text(answers, "markets_to_monitor") ?? undefined,
  }),

  lead_research_knowledge_v1: (answers) => ({
    idealCustomerProfile: {
      companyTypes: list(answers, "target_company_types"),
      industries: list(answers, "target_industries"),
      employeeRange: range(answers, "target_company_size"),
      locations: list(answers, "target_locations"),
      excludedCompanies: list(answers, "excluded_companies"),
    },
    buyerRoles: list(answers, "buyer_roles"),
    buyingSignals: list(answers, "buying_signals"),
    // Stored in the order the manager ranked them, so "weigh this most" is not
    // lost by the time the lead search reads it back.
    qualificationPriorities: list(answers, "qualification_priorities"),
  }),

  // Thin on purpose. Most of what shapes a bible belongs to the assignment —
  // this game, this mood — not to a standing profile. What lives here is the
  // handful of constraints that outlast any one project.
  art_direction_knowledge_v1: (answers) => ({
    targetEngine: text(answers, "target_engine") ?? "",
    platforms: list(answers, "platforms"),
    houseRules: list(answers, "house_rules"),
    referenceTouchstones: list(answers, "reference_touchstones"),
  }),
};

export function buildRoleKnowledge(
  definition: EmployeeDefinition,
  answers: Map<string, OnboardingAnswer>,
): unknown {
  const builder = builders[definition.roleKnowledgeSchemaId];
  return builder ? builder(answers) : null;
}
