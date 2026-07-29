import { createClient } from "@/lib/supabase/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import type { Result } from "@/lib/assignments/service";
import type { Providers } from "@/lib/execution/shared";
import { defaultProviders } from "@/lib/execution/shared";
import { meterProviders } from "@/lib/costs/meter";
import { loadCandidates } from "@/lib/projects/staffing";
import { prepareProjectPlan } from "@/lib/projects/planner";
import { ensureOrganization } from "@/lib/departments/service";
import { queueForDepartment, routeToDepartment } from "@/lib/departments/routing";
import { resolveRoleInput } from "@/lib/projects/roleInput";
import { resolvePolicies } from "@/lib/policies/resolve";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import { loadPlaybooks } from "@/lib/playbooks/service";
import {
  GOAL_MAX,
  GOAL_MIN,
  MAX_ACTIVE_PROJECTS_PER_COMPANY,
  MAX_PROJECT_REVISIONS,
  OUTCOME_MAX,
  TITLE_MAX,
  type ProjectStatus,
  type WorkItemStatus,
} from "@/lib/projects/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

export interface ProjectRow {
  id: string;
  company_id: string;
  title: string;
  goal: string;
  expected_outcome: string | null;
  priority: "low" | "normal" | "high";
  status: ProjectStatus;
  plan_json: unknown;
  progress_percentage: number;
  final_deliverable_id: string | null;
  failure_code: string | null;
  initiative_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

const ACTIVE: ProjectStatus[] = [
  "draft",
  "planning",
  "plan_ready",
  "working",
  "preparing_final_deliverable",
  "awaiting_review",
  "needs_changes",
];

export async function createProject(input: {
  title: string;
  goal: string;
  expectedOutcome?: string;
  priority?: "low" | "normal" | "high";
  initiativeId?: string;
}): Promise<Result<{ projectId: string }>> {
  const company = await getCompanyContext();
  if (!company) return { error: "Company not found.", status: 404 };

  const title = input.title?.trim() ?? "";
  const goal = input.goal?.trim() ?? "";
  const outcome = input.expectedOutcome?.trim() ?? "";

  if (!title) return { error: "Give the project a title.", status: 400 };
  if (title.length > TITLE_MAX) {
    return { error: `Keep the title under ${TITLE_MAX} characters.`, status: 400 };
  }
  if (goal.length < GOAL_MIN) {
    return {
      error: `Describe the goal in at least ${GOAL_MIN} characters.`,
      status: 400,
    };
  }
  if (goal.length > GOAL_MAX) {
    return { error: `Keep the goal under ${GOAL_MAX} characters.`, status: 400 };
  }
  if (outcome.length > OUTCOME_MAX) {
    return {
      error: `Keep the expected result under ${OUTCOME_MAX} characters.`,
      status: 400,
    };
  }

  // Checked before planning, because planning costs a model call and the answer
  // would be the same either way.
  const candidates = await loadCandidates(company.supabase as Db, company.companyId);
  if (candidates.length === 0) {
    return {
      error: "Hire and train at least one employee before starting a project.",
      status: 409,
    };
  }

  const { count } = await company.supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.companyId)
    .in("status", ACTIVE);

  if ((count ?? 0) >= MAX_ACTIVE_PROJECTS_PER_COMPANY) {
    return {
      error: "Your company already has as many projects running as it can handle.",
      status: 409,
    };
  }

  const {
    data: { user },
  } = await company.supabase.auth.getUser();

  const { data: created, error } = await company.supabase
    .from("projects")
    .insert({
      company_id: company.companyId,
      title,
      goal,
      expected_outcome: outcome || null,
      priority: input.priority ?? "normal",
      status: "draft",
      initiative_id: input.initiativeId ?? null,
      created_by_user_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { error: "I couldn't start this project.", status: 500 };
  }

  return { projectId: created.id as string };
}

/**
 * Prepares a plan for the manager to read.
 *
 * Deliberately separate from starting it. The plan is the moment the manager
 * gets to disagree before anybody's time is spent — collapsing the two would
 * mean finding out the work was divided wrongly only after paying for it.
 */
export async function prepareePlan(
  projectId: string,
  providers: Providers = defaultProviders(),
): Promise<Result<{ status: string }>> {
  const owned = await getOwnedProject(projectId);
  if (!owned) return { error: "Project not found.", status: 404 };

  const { supabase, project } = owned;

  if (!["draft", "plan_ready", "failed"].includes(project.status)) {
    return { error: "This project is already under way.", status: 409 };
  }

  // Claimed by moving out of the current status, so two clicks cannot both
  // start planning.
  const { data: claimed } = await supabase
    .from("projects")
    .update({
      status: "planning",
      planning_started_at: new Date().toISOString(),
      failure_code: null,
      failure_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("status", project.status)
    .select("id")
    .maybeSingle();

  if (!claimed) return { error: "This project is already being planned.", status: 409 };

  // Planning is the paid step, so the gate sits after the claim and before the
  // model call. The claim is released below on any failure path.
  const blocked = await blockedBySpendLimit(supabase as Db, project.company_id);
  if (blocked) {
    await supabase
      .from("projects")
      .update({ status: project.status, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    return { error: blocked, status: 402 };
  }

  // Organisation reconciled before planning, so a company that hired someone
  // since the last project plans against the departments it actually has.
  await ensureOrganization(supabase as Db, project.company_id);

  const candidates = await loadCandidates(supabase as Db, project.company_id);

  const routing = new Map<
    string,
    { departmentId: string; departmentName: string; candidates: typeof candidates }
  >();

  for (const skillId of new Set(
    candidates.flatMap((candidate) =>
      candidate.capabilities.map((capability) => capability.skillId),
    ),
  )) {
    const owner = await routeToDepartment(
      supabase as Db,
      project.company_id,
      skillId,
      candidates,
    );
    if (owner) routing.set(skillId, owner);
  }

  const { data: knowledge } = await supabase
    .from("employee_knowledge_profiles")
    .select(
      "company_summary, customer_summary, problem_summary, company_employees!inner(company_id)",
    )
    .eq("company_employees.company_id", project.company_id)
    .limit(1)
    .maybeSingle();

  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", project.company_id)
    .maybeSingle();

  const metered = meterProviders(providers, supabase as Db, {
    companyId: project.company_id,
    projectId,
  });

  const result = await prepareProjectPlan(
    metered,
    project.goal,
    project.expected_outcome ?? "",
    {
      name: (company?.name as string) ?? "the company",
      summary: (knowledge?.company_summary as string) ?? "",
      customers: (knowledge?.customer_summary as string) ?? "",
      problem: (knowledge?.problem_summary as string) ?? "",
    },
    candidates,
    routing,
    // Company-wide only: a project spans departments, so scoping to any one
    // person's would apply a standard the rest of the team isn't held to.
    await resolvePolicies(supabase as Db, project.company_id, null),
    // Named, not spelled out: the plan needs to know a method exists and what
    // it covers. The steps themselves reach the employee who does the work,
    // where they are actually followed.
    (await loadPlaybooks(supabase as Db, project.company_id))
      .filter((playbook) => playbook.status === "active")
      .map((playbook) => ({
        name: playbook.name,
        version: playbook.version,
        skillLabel: playbook.skillId ?? "work of this kind",
        stages: playbook.stages.map((stage) => stage.title),
      })),
  );

  const now = new Date().toISOString();

  if (!result.ok) {
    await supabase
      .from("projects")
      .update({
        status: "failed",
        failure_code: result.code,
        failure_message: result.detail.slice(0, 500),
        failed_at: now,
        updated_at: now,
      })
      .eq("id", projectId);

    return { error: "The project plan couldn't be prepared.", status: 422 };
  }

  await supabase
    .from("projects")
    .update({
      status: "plan_ready",
      plan_json: {
        ...result.plan,
        // Resolved staffing stored alongside the model's own plan, so the review
        // screen shows who will actually do each piece rather than who was
        // suggested.
        resolvedWorkItems: result.workItems.map((item) => ({
          clientId: item.clientId,
          companyEmployeeId: item.assignee.companyEmployeeId,
          employeeName: item.assignee.name,
          employeeRole: item.assignee.role,
          // Why this person. Stored with the resolved staffing rather than
          // left in the raw plan, so a screen showing who is doing the work
          // has the reason in the same object and cannot drift from it.
          assigneeRationale: item.assigneeRationale,
          followedRecommendation: item.followedRecommendation,
          // The department is the durable part of this. Who does the work can
          // still change between planning and starting; which department owns
          // it does not.
          departmentId: item.departmentId,
          departmentName: item.departmentName,
          // Resolved against the skill's own schema at planning time, so the
          // review screen shows the scale the work will actually run at rather
          // than what the model happened to type.
          roleInput: resolveRoleInput(
            item.assignee.definition.assignmentInputSchemaId,
            item.roleInput,
          ),
          depth: item.depth,
          sequenceOrder: item.sequenceOrder,
        })),
      },
      final_deliverable_title: result.plan.finalDeliverable.title,
      planned_at: now,
      updated_at: now,
    })
    .eq("id", projectId);

  return { status: "plan_ready" };
}

/**
 * Turns an approved plan into real work items.
 *
 * One transaction's worth of writes, guarded so a double click cannot create
 * the work twice: the work items carry a unique key on the plan's own ids, and
 * the project only moves out of "plan_ready" once.
 */
export async function startProject(
  projectId: string,
): Promise<Result<{ status: string }>> {
  const owned = await getOwnedProject(projectId);
  if (!owned) return { error: "Project not found.", status: 404 };

  const { supabase, project } = owned;

  if (project.status !== "plan_ready") {
    return { error: "This project isn't ready to start.", status: 409 };
  }

  const plan = project.plan_json as {
    workItems?: {
      clientId: string;
      title: string;
      objective: string;
      expectedOutcome: string;
      requiredSkillId: string;
      priority: string;
      executionMode: string;
      dependencyClientIds: string[];
      inputFromDependencies: {
        dependencyClientId: string;
        inputType: string;
        description: string;
      }[];
      requiredForProjectCompletion: boolean;
    }[];
    resolvedWorkItems?: {
      clientId: string;
      companyEmployeeId: string;
      departmentId?: string | null;
      roleInput?: Record<string, unknown>;
      sequenceOrder: number;
    }[];
  } | null;

  if (!plan?.workItems?.length || !plan.resolvedWorkItems?.length) {
    return { error: "This project has no plan to start.", status: 409 };
  }

  const { data: claimed } = await supabase
    .from("projects")
    .update({
      status: "working",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("status", "plan_ready")
    .select("id")
    .maybeSingle();

  if (!claimed) return { error: "This project has already started.", status: 409 };

  const staffing = new Map(
    plan.resolvedWorkItems.map((item) => [item.clientId, item]),
  );
  const idByClientId = new Map<string, string>();

  for (const item of plan.workItems) {
    const resolved = staffing.get(item.clientId);
    if (!resolved) continue;

    const hasDependencies = item.dependencyClientIds.length > 0;

    const { data: row } = await supabase
      .from("project_work_items")
      .upsert(
        {
          company_id: project.company_id,
          project_id: projectId,
          plan_client_id: item.clientId,
          title: item.title.slice(0, 200),
          objective: item.objective.slice(0, 5000),
          expected_outcome: item.expectedOutcome?.slice(0, 2000) ?? null,
          required_skill_id: item.requiredSkillId,
          company_employee_id: resolved.companyEmployeeId,
          department_id: resolved.departmentId ?? null,
          // The scale the plan asked for, already checked against the skill's
          // schema when the plan was prepared.
          role_input_json: resolved.roleInput ?? {},
          priority: item.priority,
          // Anything waiting on something else starts blocked; everything else
          // is immediately startable.
          status: hasDependencies ? "blocked" : "ready",
          execution_mode: item.executionMode,
          required_for_project_completion: item.requiredForProjectCompletion,
          sequence_order: resolved.sequenceOrder,
        },
        { onConflict: "project_id,plan_client_id" },
      )
      .select("id")
      .maybeSingle();

    if (row) {
      idByClientId.set(item.clientId, row.id as string);

      // The department is told it owes this work now, not when somebody
      // eventually picks it up — otherwise a department where everyone is busy
      // shows an empty backlog.
      if (resolved.departmentId) {
        await queueForDepartment(supabase as Db, {
          companyId: project.company_id,
          departmentId: resolved.departmentId,
          projectWorkItemId: row.id as string,
          priority: item.priority,
        });
      }
    }
  }

  for (const item of plan.workItems) {
    const workItemId = idByClientId.get(item.clientId);
    if (!workItemId) continue;

    for (const dependencyClientId of item.dependencyClientIds) {
      const dependsOn = idByClientId.get(dependencyClientId);
      if (!dependsOn) continue;

      const declared = item.inputFromDependencies.find(
        (input) => input.dependencyClientId === dependencyClientId,
      );

      await supabase.from("project_work_item_dependencies").upsert(
        {
          company_id: project.company_id,
          project_id: projectId,
          work_item_id: workItemId,
          depends_on_work_item_id: dependsOn,
          input_type: declared?.inputType ?? "deliverable_summary",
          input_description: declared?.description ?? null,
          is_required: true,
        },
        { onConflict: "work_item_id,depends_on_work_item_id" },
      );
    }
  }

  return { status: "working" };
}

export interface OwnedProject {
  supabase: Awaited<ReturnType<typeof createClient>>;
  project: ProjectRow;
}

/** Row level security scopes projects by owner, so another company's id simply
 *  misses and callers answer 404. */
export async function getOwnedProject(
  projectId: string,
): Promise<OwnedProject | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle<ProjectRow>();

  if (!data) return null;
  return { supabase, project: data };
}

export interface WorkItemView {
  id: string;
  planClientId: string;
  title: string;
  objective: string;
  status: WorkItemStatus;
  employeeName: string;
  employeeRole: string;
  companyEmployeeId: string;
  assignmentId: string | null;
  deliverableId: string | null;
  requiredForProjectCompletion: boolean;
  dependsOn: string[];
  sequenceOrder: number;
}

export async function listWorkItems(projectId: string): Promise<WorkItemView[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("project_work_items")
    .select(
      "id, plan_client_id, title, objective, status, company_employee_id, assignment_id, latest_deliverable_id, required_for_project_completion, sequence_order, company_employees(employees(name, role))",
    )
    .eq("project_id", projectId)
    .order("sequence_order", { ascending: true });

  const { data: edges } = await supabase
    .from("project_work_item_dependencies")
    .select("work_item_id, depends_on_work_item_id")
    .eq("project_id", projectId);

  const dependsOn = new Map<string, string[]>();
  for (const edge of (edges ?? []) as {
    work_item_id: string;
    depends_on_work_item_id: string;
  }[]) {
    dependsOn.set(edge.work_item_id, [
      ...(dependsOn.get(edge.work_item_id) ?? []),
      edge.depends_on_work_item_id,
    ]);
  }

  return ((data ?? []) as unknown as {
    id: string;
    plan_client_id: string;
    title: string;
    objective: string;
    status: WorkItemStatus;
    company_employee_id: string;
    assignment_id: string | null;
    latest_deliverable_id: string | null;
    required_for_project_completion: boolean;
    sequence_order: number;
    company_employees: { employees: { name: string; role: string } } | null;
  }[]).map((row) => ({
    id: row.id,
    planClientId: row.plan_client_id,
    title: row.title,
    objective: row.objective,
    status: row.status,
    employeeName: row.company_employees?.employees?.name ?? "An employee",
    employeeRole: row.company_employees?.employees?.role ?? "",
    companyEmployeeId: row.company_employee_id,
    assignmentId: row.assignment_id,
    deliverableId: row.latest_deliverable_id,
    requiredForProjectCompletion: row.required_for_project_completion,
    dependsOn: dependsOn.get(row.id) ?? [],
    sequenceOrder: row.sequence_order,
  }));
}

export async function getProjectDeliverable(projectId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("deliverables")
    .select("*")
    .eq("project_id", projectId)
    .eq("deliverable_scope", "project")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

/**
 * Rebuilds the final result without re-running anybody.
 *
 * The employees' work is finished and paid for; a failure in bringing it
 * together is not a reason to make them do it again. This is the cheap retry,
 * and it is deliberately the only one offered when the members all succeeded.
 */
export async function retryFinalDeliverable(
  projectId: string,
): Promise<Result<{ status: string }>> {
  const owned = await getOwnedProject(projectId);
  if (!owned) return { error: "Project not found.", status: 404 };

  const { supabase, project } = owned;

  if (!["failed", "needs_changes"].includes(project.status)) {
    return { error: "There's nothing to retry.", status: 409 };
  }

  const { data: items } = await supabase
    .from("project_work_items")
    .select("status, required_for_project_completion")
    .eq("project_id", projectId);

  const rows = (items ?? []) as {
    status: string;
    required_for_project_completion: boolean;
  }[];

  const requiredUnfinished = rows.filter(
    (row) => row.required_for_project_completion && row.status !== "completed",
  );

  if (requiredUnfinished.length > 0) {
    return {
      error: "Some of the work still needs to be completed first.",
      status: 409,
    };
  }

  const { data: claimed } = await supabase
    .from("projects")
    .update({
      status: "preparing_final_deliverable",
      failure_code: null,
      failure_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("status", project.status)
    .select("id")
    .maybeSingle();

  if (!claimed) return { error: "This is already being retried.", status: 409 };

  return { status: "preparing_final_deliverable" };
}

/**
 * Approves the project's result.
 *
 * Approving the project is what closes it — the members' pieces were already
 * finished when they handed them in, because the manager reviews the whole and
 * not the parts.
 */
export async function approveProject(
  projectId: string,
): Promise<Result<{ status: string }>> {
  const owned = await getOwnedProject(projectId);
  if (!owned) return { error: "Project not found.", status: 404 };

  const deliverable = await getProjectDeliverable(projectId);
  if (!deliverable || deliverable.status !== "submitted") {
    return { error: "There's nothing waiting for your review.", status: 409 };
  }

  const now = new Date().toISOString();

  const { data: approved } = await owned.supabase
    .from("deliverables")
    .update({ status: "approved", approved_at: now })
    .eq("id", deliverable.id)
    .eq("status", "submitted")
    .select("id")
    .maybeSingle();

  if (!approved) return { error: "This was already reviewed.", status: 409 };

  await owned.supabase
    .from("projects")
    .update({
      status: "completed",
      completed_at: now,
      progress_percentage: 100,
      updated_at: now,
    })
    .eq("id", projectId);

  return { status: "completed" };
}

/**
 * Records that the manager wants something different.
 *
 * Flagged for attention rather than re-run on the spot: reworking a project can
 * mean several employees' time, and committing to that should be the manager's
 * explicit next click, not a side effect of giving feedback.
 */
export async function requestProjectChanges(
  projectId: string,
  feedback: string,
): Promise<Result<{ status: string }>> {
  const trimmed = feedback.trim();
  if (trimmed.length < 10) {
    return { error: "Add at least 10 characters of feedback.", status: 400 };
  }

  const owned = await getOwnedProject(projectId);
  if (!owned) return { error: "Project not found.", status: 404 };

  const deliverable = await getProjectDeliverable(projectId);
  if (!deliverable || deliverable.status !== "submitted") {
    return { error: "There's nothing waiting for your review.", status: 409 };
  }

  const { count } = await owned.supabase
    .from("project_revision_requests")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  if ((count ?? 0) >= MAX_PROJECT_REVISIONS) {
    return {
      error: "This project has already been revised as many times as it can be.",
      status: 409,
    };
  }

  const now = new Date().toISOString();

  const { data: updated } = await owned.supabase
    .from("deliverables")
    .update({ status: "needs_changes" })
    .eq("id", deliverable.id)
    .eq("status", "submitted")
    .select("id")
    .maybeSingle();

  if (!updated) return { error: "This was already reviewed.", status: 409 };

  await owned.supabase.from("project_revision_requests").insert({
    company_id: owned.project.company_id,
    project_id: projectId,
    project_deliverable_id: deliverable.id,
    feedback: trimmed,
    status: "pending",
  });

  await owned.supabase
    .from("projects")
    .update({ status: "needs_changes", updated_at: now })
    .eq("id", projectId);

  return { status: "needs_changes" };
}

/**
 * Stops a project that hasn't finished.
 *
 * Work already handed in is kept. Cancelling should cost the manager the work
 * that hasn't happened yet, not the work they already paid for.
 */
export async function cancelProject(
  projectId: string,
): Promise<Result<{ status: string }>> {
  const owned = await getOwnedProject(projectId);
  if (!owned) return { error: "Project not found.", status: 404 };

  const { supabase } = owned;
  const now = new Date().toISOString();

  const { data: cancelled } = await supabase
    .from("projects")
    .update({ status: "cancelled", cancelled_at: now, updated_at: now })
    .eq("id", projectId)
    .in("status", [
      "draft",
      "planning",
      "plan_ready",
      "working",
      "preparing_final_deliverable",
      "awaiting_review",
      "needs_changes",
    ])
    .select("id")
    .maybeSingle();

  if (!cancelled) return { error: "This project has already finished.", status: 409 };

  const { data: stopped } = await supabase
    .from("project_work_items")
    .update({ status: "cancelled", cancelled_at: now, updated_at: now })
    .eq("project_id", projectId)
    .in("status", ["planned", "ready", "blocked", "queued"])
    .select("company_employee_id, assignment_id");

  for (const item of (stopped ?? []) as {
    company_employee_id: string;
    assignment_id: string | null;
  }[]) {
    if (item.assignment_id) {
      await supabase
        .from("assignments")
        .update({ status: "cancelled" })
        .eq("id", item.assignment_id)
        .not("status", "in", "(completed,submitted)");
    }

    await supabase
      .from("company_employees")
      .update({ work_status: "ready", current_assignment_id: null })
      .eq("id", item.company_employee_id);
  }

  return { status: "cancelled" };
}
