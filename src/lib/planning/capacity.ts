import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompanySnapshot, type CompanySnapshot } from "@/lib/intelligence/snapshot";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

const DAY_MS = 24 * 60 * 60 * 1000;
export const FORECAST_DAYS = 30;

export interface EmployeeCapacity {
  companyEmployeeId: string;
  name: string;
  departmentId: string | null;
  /** 100 when they cannot take new work right now, 0 when they can. */
  capacityUsed: number;
  activeAssignments: number;
  awaitingReview: number;
  /**
   * "waiting_on_you" is not a synonym for busy. Somebody holding a finished
   * deliverable is occupied by the manager rather than by work, and telling
   * them apart is the difference between "hire someone" and "clear your review
   * queue" — which are answers with very different prices.
   */
  state: "free" | "working" | "blocked" | "waiting_on_you";
}

export interface DepartmentCapacity {
  departmentId: string;
  name: string;
  memberCount: number;
  freeCount: number;
  /** Share of the department that cannot take new work right now. */
  capacityUsed: number;
  queueSize: number;
  /** Work expected to arrive over the forecast window, counted from schedules. */
  forecastLoad: number;
}

export interface CapacityReading {
  capturedAt: string;
  departments: DepartmentCapacity[];
  employees: EmployeeCapacity[];
  forecastDays: number;
  /** Where forecast work has nobody free to absorb it. */
  overCapacity: string[];
}

/**
 * What the company can take on right now, and what is heading for it.
 *
 * "Capacity" here means one specific, checkable thing: can this person accept
 * new work this minute. It is not a productivity score and does not try to be —
 * an employee in this system does one assignment at a time, so counting who is
 * occupied is a fact, while "Emma is at 96%" would be a number with no
 * definition behind it.
 *
 * Free to compute. Nothing here calls a model, so a manager can look at this as
 * often as they like.
 */
export async function readCapacity(
  db: Db,
  companyId: string,
): Promise<CapacityReading> {
  const snapshot = await loadCompanySnapshot(db, companyId);
  const forecast = await forecastLoad(db, companyId);

  const employees: EmployeeCapacity[] = snapshot.employees.map((employee) => {
    const awaitingReview = employee.workStatus === "awaiting_review";
    const blocked = employee.workStatus === "blocked";
    const working = employee.workStatus === "working" || employee.activeAssignments > 0;

    const state: EmployeeCapacity["state"] = awaitingReview
      ? "waiting_on_you"
      : blocked
        ? "blocked"
        : working
          ? "working"
          : "free";

    return {
      companyEmployeeId: employee.id,
      name: employee.name,
      departmentId: employee.departmentId,
      // Anything but free is capacity the company cannot spend today, whatever
      // the reason. The reason is what decides which fix is right.
      capacityUsed: state === "free" ? 0 : 100,
      activeAssignments: employee.activeAssignments,
      awaitingReview: awaitingReview ? 1 : 0,
      state,
    };
  });

  // Counted from the employee states worked out just above, not from a second
  // reading of the same question. Two definitions of "free" would drift, and
  // the page would tell the manager a department has nobody free directly
  // underneath a list of people it says are free.
  const departments: DepartmentCapacity[] = snapshot.departments.map((department) => {
    const members = employees.filter(
      (employee) => employee.departmentId === department.id,
    );
    const freeCount = members.filter((employee) => employee.state === "free").length;

    return {
      departmentId: department.id,
      name: department.name,
      memberCount: members.length,
      freeCount,
      capacityUsed:
        members.length === 0
          ? 0
          : Math.round(((members.length - freeCount) / members.length) * 100),
      queueSize: department.waitingCount,
      forecastLoad: forecast.get(department.id) ?? 0,
    };
  });

  return {
    capturedAt: snapshot.capturedAt,
    departments,
    employees,
    forecastDays: FORECAST_DAYS,
    // Over capacity means something specific: work is already queued or coming,
    // and nobody there is free to take it. Not "busy" — busy is normal.
    overCapacity: departments
      .filter(
        (department) =>
          department.freeCount === 0 &&
          department.queueSize + department.forecastLoad > 0,
      )
      .map((department) => department.departmentId),
  };
}

/**
 * How much work is already scheduled to arrive.
 *
 * Counted, never guessed: recurring assignments have a next run date, and
 * project work items that have not started are work somebody will have to do.
 * A forecast built from a trend line would be a number the manager could not
 * check, and they would be right not to act on it.
 */
async function forecastLoad(
  db: Db,
  companyId: string,
): Promise<Map<string, number>> {
  const horizon = new Date(Date.now() + FORECAST_DAYS * DAY_MS).toISOString();
  const byDepartment = new Map<string, number>();

  const { data: memberRows } = await db
    .from("department_members")
    .select("department_id, company_employee_id")
    .eq("company_id", companyId);

  const departmentOf = new Map(
    ((memberRows ?? []) as { department_id: string; company_employee_id: string }[]).map(
      (row) => [row.company_employee_id, row.department_id],
    ),
  );

  const { data: recurring } = await db
    .from("recurring_assignments")
    .select("company_employee_id, next_run_at, frequency")
    .eq("company_id", companyId)
    .eq("status", "active")
    .not("next_run_at", "is", null)
    .lte("next_run_at", horizon);

  for (const row of (recurring ?? []) as {
    company_employee_id: string;
    frequency: string | null;
  }[]) {
    const departmentId = departmentOf.get(row.company_employee_id);
    if (!departmentId) continue;

    // Roughly how many turns of this schedule land inside the window. Whole
    // numbers only — a forecast of "4.3 assignments" would be false precision.
    const perWindow =
      row.frequency === "daily"
        ? FORECAST_DAYS
        : row.frequency === "weekly"
          ? Math.floor(FORECAST_DAYS / 7)
          : row.frequency === "monthly"
            ? 1
            : 1;

    byDepartment.set(departmentId, (byDepartment.get(departmentId) ?? 0) + perWindow);
  }

  const { data: workItems } = await db
    .from("project_work_items")
    .select("company_employee_id, status")
    .eq("company_id", companyId)
    .in("status", ["planned", "queued", "waiting"]);

  for (const row of (workItems ?? []) as { company_employee_id: string | null }[]) {
    if (!row.company_employee_id) continue;
    const departmentId = departmentOf.get(row.company_employee_id);
    if (!departmentId) continue;
    byDepartment.set(departmentId, (byDepartment.get(departmentId) ?? 0) + 1);
  }

  return byDepartment;
}

/**
 * Records the reading, so "is this getting worse" has an answer.
 *
 * Appended rather than overwritten. A single capacity number tells the manager
 * nothing they cannot see by looking at the team; the same number last week is
 * what makes it useful.
 */
export async function recordCapacity(
  db: Db,
  companyId: string,
  reading: CapacityReading,
): Promise<void> {
  if (reading.departments.length > 0) {
    await db.from("department_capacity_snapshots").insert(
      reading.departments.map((department) => ({
        company_id: companyId,
        department_id: department.departmentId,
        capacity_used: department.capacityUsed,
        queue_size: department.queueSize,
        member_count: department.memberCount,
        free_count: department.freeCount,
        forecast_load: department.forecastLoad,
        captured_at: reading.capturedAt,
      })),
    );
  }

  if (reading.employees.length > 0) {
    await db.from("employee_capacity_snapshots").insert(
      reading.employees.map((employee) => ({
        company_id: companyId,
        company_employee_id: employee.companyEmployeeId,
        capacity_used: employee.capacityUsed,
        active_assignments: employee.activeAssignments,
        awaiting_review: employee.awaitingReview,
        captured_at: reading.capturedAt,
      })),
    );
  }
}

export type { CompanySnapshot };
