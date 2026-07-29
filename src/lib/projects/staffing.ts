import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getEmployeeDefinition,
  type EmployeeCapability,
  type EmployeeDefinition,
} from "@/lib/employees/definitions";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export interface Candidate {
  companyEmployeeId: string;
  slug: string;
  name: string;
  role: string;
  definition: EmployeeDefinition;
  capabilities: EmployeeCapability[];
  workStatus: string;
  /** How much project work this person is already carrying. Used only to break
   *  ties between people who can both do the job. */
  openWorkItems: number;
  lastCompletedAt: string | null;
}

/**
 * Everyone who could take on project work, with what they can do.
 *
 * Read once and handed to the planner, so the plan is written against a list of
 * real colleagues rather than against the model's memory of who might exist.
 */
export async function loadCandidates(
  db: Db,
  companyId: string,
): Promise<Candidate[]> {
  const { data } = await db
    .from("company_employees")
    .select("id, work_status, onboarding_status, employees(name, role, slug)")
    .eq("company_id", companyId)
    .eq("onboarding_status", "completed")
    .order("id", { ascending: true });

  const rows = (data ?? []) as unknown as {
    id: string;
    work_status: string;
    employees: { name: string; role: string; slug: string } | null;
  }[];

  const candidates: Candidate[] = [];

  for (const row of rows) {
    const slug = row.employees?.slug;
    if (!slug) continue;

    const definition = getEmployeeDefinition(slug);
    if (!definition) continue;

    const capabilities = definition.capabilities.filter(
      (capability) => capability.supportsProjects,
    );
    if (capabilities.length === 0) continue;

    const { count } = await db
      .from("project_work_items")
      .select("id", { count: "exact", head: true })
      .eq("company_employee_id", row.id)
      .in("status", ["ready", "blocked", "queued", "working"]);

    const { data: last } = await db
      .from("assignments")
      .select("completed_at")
      .eq("company_employee_id", row.id)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    candidates.push({
      companyEmployeeId: row.id,
      slug,
      name: definition.name,
      role: definition.role,
      definition,
      capabilities,
      workStatus: row.work_status,
      openWorkItems: count ?? 0,
      lastCompletedAt: (last?.completed_at as string | null) ?? null,
    });
  }

  return candidates;
}

/**
 * Picks who does a piece of work, given the skill it needs.
 *
 * The plan may name someone, but that name is only honoured if they actually
 * have the skill — the model choosing a colleague by feel is exactly what this
 * exists to prevent. Where several people qualify, the order is fixed and
 * stated rather than arbitrary, so the same plan staffs the same way twice.
 */
export function selectForSkill(
  candidates: Candidate[],
  requiredSkillId: string,
  preferredCompanyEmployeeId?: string,
): Candidate | null {
  const able = candidates.filter((candidate) =>
    candidate.capabilities.some(
      (capability) => capability.skillId === requiredSkillId,
    ),
  );

  if (able.length === 0) return null;

  // A suggestion from the plan counts only when the suggested person can
  // actually do it.
  const preferred = preferredCompanyEmployeeId
    ? able.find(
        (candidate) => candidate.companyEmployeeId === preferredCompanyEmployeeId,
      )
    : undefined;
  if (preferred) return preferred;

  const ranked = [...able].sort((a, b) => {
    // Free before busy — but busy is never disqualifying, because a plan is
    // allowed to include someone who will be free by the time their turn comes.
    const readiness = readinessRank(a) - readinessRank(b);
    if (readiness !== 0) return readiness;

    if (a.openWorkItems !== b.openWorkItems) {
      return a.openWorkItems - b.openWorkItems;
    }

    // Longest idle first, so work spreads rather than piling on whoever
    // happened to finish most recently.
    const aLast = a.lastCompletedAt ?? "";
    const bLast = b.lastCompletedAt ?? "";
    if (aLast !== bLast) return aLast.localeCompare(bLast);

    // A stable last resort. Without it two equally-suited colleagues could be
    // picked differently on identical input.
    return a.companyEmployeeId.localeCompare(b.companyEmployeeId);
  });

  return ranked[0];
}

function readinessRank(candidate: Candidate): number {
  if (candidate.workStatus === "ready") return 0;
  if (candidate.workStatus === "awaiting_review") return 2;
  return 1;
}

/** Every skill the company can currently field. What the planner is allowed to
 *  ask for, and what an "we can't do this" message is measured against. */
export function availableSkills(candidates: Candidate[]): string[] {
  return [
    ...new Set(
      candidates.flatMap((candidate) =>
        candidate.capabilities.map((capability) => capability.skillId),
      ),
    ),
  ];
}
