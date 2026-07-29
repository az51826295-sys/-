import type { SupabaseClient } from "@supabase/supabase-js";
import type { Candidate } from "@/lib/projects/staffing";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export interface DepartmentRouting {
  departmentId: string;
  departmentName: string;
  /** Everyone in this department who can do the work, ordered by who should
   *  take it. Empty means the department owns the work but has nobody free —
   *  which is a wait, not a failure. */
  candidates: Candidate[];
}

/**
 * Finds the department responsible for a skill, and who in it could do the work.
 *
 * The order matters and is the point of Day 13: the skill picks a department,
 * and the department picks a person. Going straight to a person would mean work
 * quietly crossing organisational lines whenever the obvious employee happened
 * to be busy — which is exactly what an organisation exists to stop.
 */
export async function routeToDepartment(
  db: Db,
  companyId: string,
  skillId: string,
  candidates: Candidate[],
): Promise<DepartmentRouting | null> {
  const { data: owner } = await db
    .from("department_skills")
    .select("department_id, departments(name)")
    .eq("company_id", companyId)
    .eq("skill_id", skillId)
    .maybeSingle();

  if (!owner) return null;

  const departmentId = owner.department_id as string;
  const departmentName =
    (owner as unknown as { departments: { name: string } | null }).departments
      ?.name ?? "a department";

  const { data: memberRows } = await db
    .from("department_members")
    .select("company_employee_id")
    .eq("department_id", departmentId);

  const memberIds = new Set(
    ((memberRows ?? []) as { company_employee_id: string }[]).map(
      (row) => row.company_employee_id,
    ),
  );

  // Both conditions, not either: being in the department is not enough if the
  // person cannot do the work, and being able to do the work is not enough if
  // they work somewhere else.
  const able = candidates.filter(
    (candidate) =>
      memberIds.has(candidate.companyEmployeeId) &&
      candidate.capabilities.some(
        (capability) => capability.skillId === skillId,
      ),
  );

  return {
    departmentId,
    departmentName,
    candidates: [...able].sort(compareForAssignment),
  };
}

/**
 * Who in a department should take the next piece of work.
 *
 * Free before busy, then least loaded, then longest idle. The final tie-break
 * is the id rather than anything meaningful, so the same situation always
 * resolves the same way — a department that staffs work differently on
 * identical input is not following a policy, it is guessing.
 */
export function compareForAssignment(a: Candidate, b: Candidate): number {
  const readiness = readinessRank(a) - readinessRank(b);
  if (readiness !== 0) return readiness;

  if (a.openWorkItems !== b.openWorkItems) {
    return a.openWorkItems - b.openWorkItems;
  }

  const aLast = a.lastCompletedAt ?? "";
  const bLast = b.lastCompletedAt ?? "";
  if (aLast !== bLast) return aLast.localeCompare(bLast);

  return a.companyEmployeeId.localeCompare(b.companyEmployeeId);
}

function readinessRank(candidate: Candidate): number {
  if (candidate.workStatus === "ready") return 0;
  if (candidate.workStatus === "awaiting_review") return 2;
  return 1;
}

/**
 * Records that a department owes this work.
 *
 * Written when the work is planned, not when somebody starts it, so a
 * department where everyone is busy shows the backlog rather than showing
 * nothing.
 */
export async function queueForDepartment(
  db: Db,
  input: {
    companyId: string;
    departmentId: string;
    projectWorkItemId?: string;
    assignmentId?: string;
    priority?: string;
  },
): Promise<void> {
  const { error } = await db.from("department_work_queue").upsert(
    {
      company_id: input.companyId,
      department_id: input.departmentId,
      project_work_item_id: input.projectWorkItemId ?? null,
      assignment_id: input.assignmentId ?? null,
      priority: input.priority ?? "normal",
      status: "queued",
    },
    { onConflict: "project_work_item_id" },
  );

  // Checked rather than ignored. A queue write that fails quietly makes every
  // department look like it has nothing waiting, which is the one thing this
  // table exists to show — and the failure would never surface anywhere.
  if (error) {
    throw new Error(`could not queue work for the department: ${error.message}`);
  }
}

/** Marks the department's queued work as taken once somebody actually starts
 *  it, so the backlog reflects what is still waiting rather than everything
 *  that ever arrived. */
export async function markQueuedAssigned(
  db: Db,
  projectWorkItemId: string,
  assignmentId: string,
): Promise<void> {
  await db
    .from("department_work_queue")
    .update({
      status: "assigned",
      assignment_id: assignmentId,
      updated_at: new Date().toISOString(),
    })
    .eq("project_work_item_id", projectWorkItemId);
}

export async function markQueuedCompleted(
  db: Db,
  projectWorkItemId: string,
): Promise<void> {
  await db
    .from("department_work_queue")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("project_work_item_id", projectWorkItemId);
}
