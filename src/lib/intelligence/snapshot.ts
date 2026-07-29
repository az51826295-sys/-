import type { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

/**
 * Everything the company's state is worked out from, read once.
 *
 * Gathered in one place rather than per detector so a diagnosis is a fixed
 * picture of one moment. Detectors reading the database independently would
 * each see a slightly different company, and two insights drawn from the same
 * afternoon could then contradict each other.
 */
export interface CompanySnapshot {
  capturedAt: string;
  departments: {
    id: string;
    name: string;
    memberCount: number;
    readyCount: number;
    workingCount: number;
    waitingCount: number;
    activeAssignments: number;
  }[];
  employees: {
    id: string;
    name: string;
    departmentId: string | null;
    workStatus: string;
    activeAssignments: number;
  }[];
  /**
   * Work that started and went quiet.
   *
   * An employee whose status has said "working" since Tuesday is not busy,
   * they are stuck — and the two look identical on every screen in this
   * product. Nobody is blocked by it, no bill arrives for it, and it will sit
   * there forever unless something counts the hours.
   */
  stalled: { title: string; hours: number }[];
  review: {
    /** Deliverables handed in and waiting on the manager. */
    awaiting: number;
    /** How long the oldest has been waiting, in whole days. */
    oldestWaitingDays: number;
    /** Deliverables an approval is blocked on by a required standard. */
    blockedByStandards: number;
  };
  quality: {
    reviewed: number;
    changesRequested: number;
    /** What the manager actually wrote when sending work back.
     *
     *  Carried as text rather than reduced to a count, because a company
     *  learning about itself is exactly the thing a count destroys: three
     *  rejections tell you the employees are struggling, and three rejections
     *  that all say "check this against the vendor's own page" tell you the
     *  company has a standard nobody has written down. */
    changeRequests: string[];
  };
  learning: {
    pendingCandidates: number;
    proposedPlaybookChanges: number;
  };
  projects: {
    active: number;
    awaitingApproval: number;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far back quality is measured. Long enough to be a rate rather than an
 *  anecdote, short enough that last quarter's problems don't mask this week's. */
const QUALITY_WINDOW_DAYS = 30;

export async function loadCompanySnapshot(
  db: Db,
  companyId: string,
): Promise<CompanySnapshot> {
  const now = Date.now();
  const since = new Date(now - QUALITY_WINDOW_DAYS * DAY_MS).toISOString();

  const [
    departmentRows,
    memberRows,
    hireRows,
    assignmentRows,
    queueRows,
    pendingDeliverables,
    reviewRows,
    findingRows,
    candidateRows,
    draftRows,
    projectRows,
  ] = await Promise.all([
    db.from("departments").select("id, name").eq("company_id", companyId),
    db
      .from("department_members")
      .select("department_id, company_employee_id")
      .eq("company_id", companyId),
    db
      .from("company_employees")
      .select("id, work_status, employees(name)")
      .eq("company_id", companyId),
    db
      .from("assignments")
      // started_at and the title come along for the stalled-work check: an
      // employee who has been "working" since Tuesday is not busy, they are
      // stuck, and telling those apart needs a clock and a name.
      .select("id, company_employee_id, status, title, started_at, assigned_at")
      .eq("company_id", companyId)
      .in("status", ["queued", "working", "in_progress"]),
    db
      .from("department_work_queue")
      .select("id, department_id, status")
      .eq("company_id", companyId)
      .eq("status", "waiting"),
    db
      .from("deliverables")
      .select("id, submitted_at, assignments!inner(assignment_type)")
      .eq("company_id", companyId)
      .eq("status", "submitted")
      .eq("assignments.assignment_type", "manager"),
    db
      .from("deliverable_reviews")
      .select("id, decision, feedback")
      .eq("company_id", companyId)
      .gte("created_at", since),
    db
      .from("deliverable_policy_findings")
      .select("deliverable_id, deliverables!inner(status)")
      .eq("company_id", companyId)
      .eq("severity", "blocking")
      .eq("deliverables.status", "submitted"),
    db
      .from("learning_candidates")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "pending"),
    db
      .from("playbook_improvement_drafts")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "proposed"),
    db
      .from("projects")
      .select("id, status")
      .eq("company_id", companyId)
      .in("status", ["draft", "plan_ready", "planning", "working", "merging", "reviewing"]),
  ]);

  const departments = (departmentRows.data ?? []) as { id: string; name: string }[];
  const members = (memberRows.data ?? []) as {
    department_id: string;
    company_employee_id: string;
  }[];
  const hires = ((hireRows.data ?? []) as unknown as {
    id: string;
    work_status: string;
    employees: { name: string } | null;
  }[]);
  const assignments = (assignmentRows.data ?? []) as {
    company_employee_id: string;
    title: string;
    started_at: string | null;
    assigned_at: string | null;
  }[];
  const queue = (queueRows.data ?? []) as { department_id: string }[];

  const departmentOf = new Map(
    members.map((row) => [row.company_employee_id, row.department_id]),
  );

  const assignmentsByEmployee = new Map<string, number>();
  for (const row of assignments) {
    assignmentsByEmployee.set(
      row.company_employee_id,
      (assignmentsByEmployee.get(row.company_employee_id) ?? 0) + 1,
    );
  }

  const waitingByDepartment = new Map<string, number>();
  for (const row of queue) {
    waitingByDepartment.set(
      row.department_id,
      (waitingByDepartment.get(row.department_id) ?? 0) + 1,
    );
  }

  const employees = hires.map((hire) => ({
    id: hire.id,
    name: hire.employees?.name ?? "Someone",
    departmentId: departmentOf.get(hire.id) ?? null,
    workStatus: hire.work_status,
    activeAssignments: assignmentsByEmployee.get(hire.id) ?? 0,
  }));

  const submitted = ((pendingDeliverables.data ?? []) as {
    submitted_at: string | null;
  }[]);

  const oldest = submitted
    .map((row) => (row.submitted_at ? Date.parse(row.submitted_at) : now))
    .sort((a, b) => a - b)[0];

  const reviews = (reviewRows.data ?? []) as {
    decision: string;
    feedback: string | null;
  }[];

  return {
    capturedAt: new Date(now).toISOString(),
    // Measured from when the work actually began, falling back to when it was
    // handed over. Sorted worst first and capped, because the point is the one
    // that has been sitting longest, not an inventory.
    stalled: assignments
      .map((row) => {
        const since = row.started_at ?? row.assigned_at;
        if (!since) return null;
        const hours = (now - new Date(since).getTime()) / 3_600_000;
        return hours > 0 ? { title: row.title, hours: Math.floor(hours) } : null;
      })
      .filter((row): row is { title: string; hours: number } => row !== null)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5),
    departments: departments.map((department) => {
      const inDepartment = employees.filter(
        (employee) => employee.departmentId === department.id,
      );
      return {
        id: department.id,
        name: department.name,
        memberCount: inDepartment.length,
        readyCount: inDepartment.filter((e) => e.workStatus === "ready").length,
        workingCount: inDepartment.filter((e) => e.workStatus === "working").length,
        waitingCount: waitingByDepartment.get(department.id) ?? 0,
        activeAssignments: inDepartment.reduce(
          (sum, employee) => sum + employee.activeAssignments,
          0,
        ),
      };
    }),
    employees,
    review: {
      awaiting: submitted.length,
      oldestWaitingDays:
        oldest === undefined ? 0 : Math.floor((now - oldest) / DAY_MS),
      blockedByStandards: new Set(
        ((findingRows.data ?? []) as { deliverable_id: string }[]).map(
          (row) => row.deliverable_id,
        ),
      ).size,
    },
    quality: {
      changeRequests: reviews
        .filter((row) => row.decision === "needs_changes" && row.feedback)
        .map((row) => row.feedback as string),
      reviewed: reviews.length,
      changesRequested: reviews.filter((row) => row.decision === "needs_changes")
        .length,
    },
    learning: {
      pendingCandidates: (candidateRows.data ?? []).length,
      proposedPlaybookChanges: (draftRows.data ?? []).length,
    },
    projects: {
      active: (projectRows.data ?? []).length,
      awaitingApproval: ((projectRows.data ?? []) as { status: string }[]).filter(
        (row) => row.status === "plan_ready",
      ).length,
    },
  };
}
