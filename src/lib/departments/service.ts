import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { FALLBACK_DEPARTMENT, departmentForSkill } from "@/lib/departments/catalog";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export interface DepartmentRow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

/**
 * Makes sure the company's organisation reflects who actually works there.
 *
 * Only the departments that have someone in them are created. A company with
 * two employees does not have five departments — showing three empty ones
 * would describe an aspiration rather than the company, and every capacity
 * figure on the page would be zero for no reason.
 *
 * Safe to call repeatedly: it reconciles rather than inserts.
 */
export async function ensureOrganization(
  db: Db,
  companyId: string,
): Promise<void> {
  const { data: hireRows } = await db
    .from("company_employees")
    .select("id, employees(slug)")
    .eq("company_id", companyId);

  const hires = ((hireRows ?? []) as unknown as {
    id: string;
    employees: { slug: string } | null;
  }[])
    .map((row) => ({
      companyEmployeeId: row.id,
      skillId: row.employees?.slug
        ? getEmployeeDefinition(row.employees.slug)?.skillId
        : undefined,
    }))
    .filter((hire) => hire.skillId);

  if (hires.length === 0) return;

  const needed = new Map<string, { description: string; skillIds: string[] }>();

  for (const hire of hires) {
    const template =
      departmentForSkill(hire.skillId!) ?? FALLBACK_DEPARTMENT;
    const existing = needed.get(template.name);
    needed.set(template.name, {
      description: template.description,
      skillIds: [...new Set([...(existing?.skillIds ?? []), hire.skillId!])],
    });
  }

  const byName = new Map<string, string>();

  for (const [name, template] of needed) {
    const { data: existing } = await db
      .from("departments")
      .select("id")
      .eq("company_id", companyId)
      .ilike("name", name)
      .maybeSingle();

    if (existing) {
      byName.set(name, existing.id as string);
      continue;
    }

    const { data: created } = await db
      .from("departments")
      .insert({
        company_id: companyId,
        name,
        description: template.description,
      })
      .select("id")
      .maybeSingle();

    if (created) byName.set(name, created.id as string);
  }

  // Which skills already belong to a department here.
  //
  // The catalog seeds ownership once; after that the company's own arrangement
  // wins. Upserting would silently drag a skill back to its default department
  // every time a page loaded, undoing a deliberate reorganisation.
  const { data: owned } = await db
    .from("department_skills")
    .select("skill_id")
    .eq("company_id", companyId);

  const alreadyOwned = new Set(
    ((owned ?? []) as { skill_id: string }[]).map((row) => row.skill_id),
  );

  for (const [name, template] of needed) {
    const departmentId = byName.get(name);
    if (!departmentId) continue;

    for (const skillId of template.skillIds) {
      if (alreadyOwned.has(skillId)) continue;

      await db.from("department_skills").insert({
        company_id: companyId,
        department_id: departmentId,
        skill_id: skillId,
      });
      alreadyOwned.add(skillId);
    }
  }

  // Only people who are not in a department yet.
  //
  // An upsert here would overwrite the manager's own decisions: move somebody
  // to a different department and the next page load would silently move them
  // back. This places new hires and leaves everything else alone.
  const { data: placed } = await db
    .from("department_members")
    .select("company_employee_id")
    .eq("company_id", companyId);

  const alreadyPlaced = new Set(
    ((placed ?? []) as { company_employee_id: string }[]).map(
      (row) => row.company_employee_id,
    ),
  );

  for (const hire of hires) {
    if (alreadyPlaced.has(hire.companyEmployeeId)) continue;

    const template = departmentForSkill(hire.skillId!) ?? FALLBACK_DEPARTMENT;
    const departmentId = byName.get(template.name);
    if (!departmentId) continue;

    await db.from("department_members").insert({
      company_id: companyId,
      department_id: departmentId,
      company_employee_id: hire.companyEmployeeId,
    });
  }
}

export interface DepartmentCapacity {
  id: string;
  name: string;
  description: string | null;
  employeeCount: number;
  readyCount: number;
  workingCount: number;
  /** Work that has reached this department but has nobody on it yet. */
  waitingCount: number;
  activeAssignments: number;
  skillIds: string[];
  members: {
    companyEmployeeId: string;
    name: string;
    role: string;
    workStatus: string;
  }[];
}

/**
 * What each department is carrying.
 *
 * Computed from the work that exists, never stored — a capacity number that can
 * drift from reality is worse than no number, because the manager will plan
 * against it.
 */
export async function loadOrganization(
  db: Db,
  companyId: string,
): Promise<DepartmentCapacity[]> {
  const { data: departmentRows } = await db
    .from("departments")
    .select("id, name, description")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  const departments = (departmentRows ?? []) as {
    id: string;
    name: string;
    description: string | null;
  }[];

  if (departments.length === 0) return [];

  const { data: skillRows } = await db
    .from("department_skills")
    .select("department_id, skill_id")
    .eq("company_id", companyId);

  const { data: memberRows } = await db
    .from("department_members")
    .select(
      "department_id, company_employee_id, company_employees(work_status, employees(name, role))",
    )
    .eq("company_id", companyId);

  const members = (memberRows ?? []) as unknown as {
    department_id: string;
    company_employee_id: string;
    company_employees: {
      work_status: string;
      employees: { name: string; role: string };
    } | null;
  }[];

  const { data: queueRows } = await db
    .from("department_work_queue")
    .select("department_id")
    .eq("company_id", companyId)
    .eq("status", "queued");

  const { data: activeRows } = await db
    .from("assignments")
    .select("department_id")
    .eq("company_id", companyId)
    .not("department_id", "is", null)
    .in("status", ["assigned", "queued", "working", "submitted"]);

  const countBy = (rows: { department_id: string }[] | null) => {
    const counts = new Map<string, number>();
    for (const row of rows ?? []) {
      counts.set(row.department_id, (counts.get(row.department_id) ?? 0) + 1);
    }
    return counts;
  };

  const waiting = countBy(queueRows as { department_id: string }[]);
  const active = countBy(activeRows as { department_id: string }[]);

  return departments.map((department) => {
    const own = members.filter((member) => member.department_id === department.id);

    return {
      id: department.id,
      name: department.name,
      description: department.description,
      employeeCount: own.length,
      readyCount: own.filter(
        (member) => member.company_employees?.work_status === "ready",
      ).length,
      workingCount: own.filter(
        (member) => member.company_employees?.work_status === "working",
      ).length,
      waitingCount: waiting.get(department.id) ?? 0,
      activeAssignments: active.get(department.id) ?? 0,
      skillIds: ((skillRows ?? []) as { department_id: string; skill_id: string }[])
        .filter((row) => row.department_id === department.id)
        .map((row) => row.skill_id),
      members: own.map((member) => ({
        companyEmployeeId: member.company_employee_id,
        name: member.company_employees?.employees?.name ?? "An employee",
        role: member.company_employees?.employees?.role ?? "",
        workStatus: member.company_employees?.work_status ?? "unknown",
      })),
    };
  });
}
