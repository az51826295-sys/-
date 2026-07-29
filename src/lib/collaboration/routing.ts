import type { SupabaseClient } from "@supabase/supabase-js";
import { employeeSkillRegistry } from "@/lib/skills/registry";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import type { SkillCapability } from "@/lib/skills/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export interface Colleague {
  companyEmployeeId: string;
  name: string;
  role: string;
  slug: string;
  skillId: string;
  capabilities: SkillCapability[];
  /** Free to take work right now. A busy colleague is still listed, so the
   *  requester can be told why they can't have help rather than being left to
   *  wonder why nobody exists. */
  available: boolean;
}

/** Employee states that mean they cannot take on anything else right now. */
const BUSY = ["assigned", "working", "awaiting_review", "blocked"];

/**
 * Who else works here and what they can be asked for.
 *
 * Scoped to the company and to employees who have finished onboarding: an
 * employee who doesn't know the company can't help with anything about it.
 * The requester is always excluded — asking yourself for help is a loop, and
 * the database refuses it anyway.
 */
export async function findColleagues(
  db: Db,
  companyId: string,
  /** Omitted when nobody is asking — the Workforce Manager choosing who should
   *  do a piece of a project wants everyone, itself included in the sense that
   *  there is no "itself". Passing an empty string here would compare a uuid
   *  column against "" and return nothing at all. */
  requesterCompanyEmployeeId?: string,
): Promise<Colleague[]> {
  let query = db
    .from("company_employees")
    .select("id, work_status, onboarding_status, employees(name, role, slug)")
    .eq("company_id", companyId)
    .eq("onboarding_status", "completed");

  if (requesterCompanyEmployeeId) {
    query = query.neq("id", requesterCompanyEmployeeId);
  }

  const { data } = await query;

  const colleagues: Colleague[] = [];

  for (const row of (data ?? []) as unknown as {
    id: string;
    work_status: string;
    employees: { name: string; role: string; slug: string };
  }[]) {
    const definition = getEmployeeDefinition(row.employees?.slug ?? "");
    if (!definition) continue;

    const skill = employeeSkillRegistry[definition.skillId];
    if (!skill?.acceptsInternalRequests || skill.capabilities.length === 0) continue;

    colleagues.push({
      companyEmployeeId: row.id,
      name: row.employees.name,
      role: row.employees.role,
      slug: row.employees.slug,
      skillId: definition.skillId,
      capabilities: skill.capabilities,
      available: !BUSY.includes(row.work_status),
    });
  }

  return colleagues;
}

/**
 * Who should take a given capability.
 *
 * Matched on the capability, never on who the requester happens to know. If two
 * colleagues can do it, the free one wins; if none is free, the first match is
 * returned anyway so the caller can explain the wait instead of pretending the
 * skill doesn't exist here.
 */
export function routeCapability(
  colleagues: Colleague[],
  capabilityId: string,
): Colleague | null {
  const able = colleagues.filter((colleague) =>
    colleague.capabilities.some((capability) => capability.id === capabilityId),
  );

  if (able.length === 0) return null;
  return able.find((colleague) => colleague.available) ?? able[0];
}

/** Every capability available anywhere in this company, for the prompt that
 *  asks an employee whether they need help. */
export function availableCapabilities(
  colleagues: Colleague[],
): { colleague: Colleague; capability: SkillCapability }[] {
  return colleagues.flatMap((colleague) =>
    colleague.capabilities.map((capability) => ({ colleague, capability })),
  );
}
