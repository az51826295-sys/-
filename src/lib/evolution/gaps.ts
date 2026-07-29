import type { SupabaseClient } from "@supabase/supabase-js";
import { employeeDefinitions, getEmployeeDefinition } from "@/lib/employees/definitions";
import { getEmployeeSkill } from "@/lib/skills/registry";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export interface RoleGap {
  signalKey: string;
  title: string;
  reason: string;
  skillId: string | null;
  departmentId: string | null;
  occurrences: number;
  confidence: "low" | "medium" | "high";
}

/**
 * Work this company has needed and had nobody for.
 *
 * Every gap here rests on something that actually happened and was recorded:
 * a plan the company could not make, a colleague nobody could be found for, a
 * department holding work none of its people can do. Nothing is inferred from
 * the subjects of past assignments — reading intent out of titles would invent
 * roles nobody asked for, and a hiring suggestion built on the system's
 * imagination is worse than no suggestion.
 *
 * Free. All of it is counting rows.
 */
export async function detectRoleGaps(
  db: Db,
  companyId: string,
): Promise<RoleGap[]> {
  const gaps: RoleGap[] = [];

  // 1. Colleagues who could not be found.
  //
  // The strongest evidence there is: an employee mid-assignment decided they
  // needed help with something specific, and the company had nobody.
  const { data: unrouted } = await db
    .from("internal_requests")
    .select("requested_capability, failure_code")
    .eq("company_id", companyId)
    .in("failure_code", ["NO_COLLEAGUE", "NO_EMPLOYEES", "NO_CAPABILITY"]);

  const byCapability = new Map<string, number>();
  for (const row of (unrouted ?? []) as { requested_capability: string | null }[]) {
    if (!row.requested_capability) continue;
    byCapability.set(
      row.requested_capability,
      (byCapability.get(row.requested_capability) ?? 0) + 1,
    );
  }

  for (const [capability, occurrences] of byCapability) {
    gaps.push({
      signalKey: `capability_unmet:${capability}`,
      title: `Nobody here can do "${humanise(capability)}"`,
      reason: `An employee needed this ${occurrences} ${occurrences === 1 ? "time" : "times"} while working and found nobody in the company who could help.`,
      skillId: null,
      departmentId: null,
      occurrences,
      confidence: occurrences >= 3 ? "high" : occurrences >= 2 ? "medium" : "low",
    });
  }

  // 2. Projects that could not be planned for want of people.
  const { data: unplanned } = await db
    .from("projects")
    .select("failure_code, failure_message")
    .eq("company_id", companyId)
    .in("failure_code", ["NO_EMPLOYEES", "CANNOT_PLAN", "PLANNING_FAILED"]);

  const unplannedCount = (unplanned ?? []).length;
  if (unplannedCount > 0) {
    gaps.push({
      signalKey: "projects_unplannable",
      title: "Work has been asked for that the company could not staff",
      reason: `${unplannedCount} ${unplannedCount === 1 ? "project" : "projects"} could not be planned because the skills needed are not here.`,
      skillId: null,
      departmentId: null,
      occurrences: unplannedCount,
      confidence: unplannedCount >= 2 ? "high" : "medium",
    });
  }

  // 3. A department that owns work none of its people can do.
  //
  // This one is structural rather than historical: the organisation says this
  // department is responsible for a kind of work, and nobody in it can do it.
  // Work routed there would sit for ever.
  const { data: ownedSkills } = await db
    .from("department_skills")
    .select("skill_id, department_id, departments(name)")
    .eq("company_id", companyId);

  const { data: memberRows } = await db
    .from("department_members")
    .select("department_id, company_employees(employees(slug))")
    .eq("company_id", companyId);

  const skillsByDepartment = new Map<string, Set<string>>();
  for (const row of (memberRows ?? []) as unknown as {
    department_id: string;
    company_employees: { employees: { slug: string } | null } | null;
  }[]) {
    const slug = row.company_employees?.employees?.slug;
    if (!slug) continue;
    const skillId = getEmployeeDefinition(slug)?.skillId;
    if (!skillId) continue;
    const set = skillsByDepartment.get(row.department_id) ?? new Set<string>();
    set.add(skillId);
    skillsByDepartment.set(row.department_id, set);
  }

  for (const row of (ownedSkills ?? []) as unknown as {
    skill_id: string;
    department_id: string;
    departments: { name: string } | null;
  }[]) {
    const covered = skillsByDepartment.get(row.department_id)?.has(row.skill_id);
    if (covered) continue;

    gaps.push({
      signalKey: `department_uncovered:${row.department_id}:${row.skill_id}`,
      title: `${row.departments?.name ?? "A department"} owns work nobody there can do`,
      reason: `${row.departments?.name ?? "The department"} is responsible for ${humanise(row.skill_id)}, and none of its people can do it. Work routed there would wait indefinitely.`,
      skillId: row.skill_id,
      departmentId: row.department_id,
      occurrences: 1,
      confidence: "high",
    });
  }

  // 4. A skill the whole company rests on one person for.
  //
  // Not a shortage — a fragility. It only becomes visible as a shortage on the
  // day that person is busy and something urgent arrives, which is too late to
  // be told about it.
  const { data: hires } = await db
    .from("company_employees")
    .select("id, employees(slug, name)")
    .eq("company_id", companyId);

  const holders = new Map<string, string[]>();
  for (const row of (hires ?? []) as unknown as {
    employees: { slug: string; name: string } | null;
  }[]) {
    const slug = row.employees?.slug;
    if (!slug) continue;
    const skillId = getEmployeeDefinition(slug)?.skillId;
    if (!skillId) continue;
    holders.set(skillId, [...(holders.get(skillId) ?? []), row.employees!.name]);
  }

  for (const [skillId, names] of holders) {
    if (names.length !== 1) continue;

    // Only worth raising where that person is actually in demand. One person
    // covering a skill nobody has needed yet is not a risk, it is a company
    // with one of everything.
    const { count } = await db
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["queued", "working", "in_progress", "submitted", "completed"]);

    if ((count ?? 0) < 3) continue;

    gaps.push({
      signalKey: `single_holder:${skillId}`,
      title: `Only ${names[0]} can do ${humanise(skillId)}`,
      reason: `The company depends on one person for this. While they are busy, work of this kind waits, and there is nobody to check their thinking.`,
      skillId,
      departmentId: null,
      occurrences: 1,
      confidence: "medium",
    });
  }

  return gaps;
}

/**
 * A role in the catalogue that would close a gap.
 *
 * Reuses a defined employee rather than inventing a job title, so an accepted
 * proposal produces somebody who arrives with a skill, a method and an
 * onboarding — not a name on an org chart.
 */
export function roleForSkill(
  skillId: string | null,
): { slug: string; name: string; role: string } | null {
  if (!skillId) return null;

  const definition = employeeDefinitions.find(
    (candidate) => candidate.skillId === skillId,
  );

  return definition
    ? { slug: definition.slug, name: definition.name, role: definition.role }
    : null;
}

/** Which defined role can serve a named capability, when one can. */
export function roleForCapability(
  capability: string,
): { slug: string; name: string; role: string } | null {
  for (const definition of employeeDefinitions) {
    const skill = safeSkill(definition.skillId);
    if (!skill) continue;
    if (skill.capabilities.some((entry) => entry.id === capability)) {
      return { slug: definition.slug, name: definition.name, role: definition.role };
    }
  }
  return null;
}

function safeSkill(skillId: string) {
  try {
    return getEmployeeSkill(skillId);
  } catch {
    return null;
  }
}

/** Registry ids are written for the code; the manager should not have to read
 *  "lead_qualification". */
function humanise(id: string): string {
  return id.replace(/_/g, " ");
}
