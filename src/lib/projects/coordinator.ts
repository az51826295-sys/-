import type { SupabaseClient } from "@supabase/supabase-js";
import { initialProgressSteps } from "@/lib/assignments/progress";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { defaultProviders, type Providers } from "@/lib/execution/shared";
import { executeEmployeeAssignment } from "@/lib/execution/engine";
import { meterProviders } from "@/lib/costs/meter";
import { extractDependencyOutput } from "@/lib/projects/dependencyOutput";
import { summarizeWorkItem } from "@/lib/projects/summaries";
import { prepareProjectDeliverable } from "@/lib/projects/merge";
import {
  markQueuedAssigned,
  markQueuedCompleted,
} from "@/lib/departments/routing";
import {
  workItemProgressWeight,
  type ProjectFailureCode,
  type WorkItemStatus,
} from "@/lib/projects/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export interface WorkItemRow {
  id: string;
  company_id: string;
  project_id: string;
  plan_client_id: string;
  title: string;
  objective: string;
  expected_outcome: string | null;
  required_skill_id: string;
  company_employee_id: string;
  priority: string;
  status: WorkItemStatus;
  required_for_project_completion: boolean;
  role_input_json: Record<string, unknown>;
  assignment_id: string | null;
  latest_deliverable_id: string | null;
  sequence_order: number;
  /** Which department owes this work. Null for a company that has not been
   *  organised into departments. */
  department_id: string | null;
}

/**
 * Lets the department pick who actually does the work.
 *
 * Planning named somebody, but planning happened earlier. If that person is
 * busy now and a colleague in the same department is free, the department
 * reassigns — which is the difference between an organisation and a list of
 * names. Falls back to the planned assignee when there is no department, or
 * when nobody in it is any freer.
 */
async function confirmAssignee(db: Db, item: WorkItemRow): Promise<WorkItemRow> {
  if (!item.department_id) return item;

  const { data: memberRows } = await db
    .from("department_members")
    .select("company_employee_id, company_employees(work_status)")
    .eq("department_id", item.department_id);

  const members = ((memberRows ?? []) as unknown as {
    company_employee_id: string;
    company_employees: { work_status: string } | null;
  }[]).filter((member) => member.company_employees);

  const planned = members.find(
    (member) => member.company_employee_id === item.company_employee_id,
  );

  // The planned person is free, so nothing to reconsider.
  if (planned?.company_employees?.work_status === "ready") return item;

  const free = members
    .filter((member) => member.company_employees?.work_status === "ready")
    // Stable, so the same situation staffs the same way twice.
    .sort((a, b) => a.company_employee_id.localeCompare(b.company_employee_id));

  // Nobody else is free either. The planned person keeps it and the work waits
  // on them, which is honest — the department has no spare capacity.
  if (free.length === 0) return item;

  const { data: capable } = await db
    .from("company_employees")
    .select("id, employees(slug)")
    .in(
      "id",
      free.map((member) => member.company_employee_id),
    );

  const eligible = ((capable ?? []) as unknown as {
    id: string;
    employees: { slug: string } | null;
  }[]).find((row) => {
    const definition = row.employees?.slug
      ? getEmployeeDefinition(row.employees.slug)
      : undefined;
    // Being free is not enough — they have to be able to do this particular
    // work. A department is not interchangeable people.
    return definition?.capabilities.some(
      (capability) => capability.skillId === item.required_skill_id,
    );
  });

  if (!eligible) return item;

  return { ...item, company_employee_id: eligible.id };
}

/**
 * Moves a project forward by exactly as much as it currently can.
 *
 * Written to be called repeatedly and safely rather than as one long run: it
 * looks at where everything is, starts whatever is now startable, and returns.
 * That makes it the same code path for the first start, for a retry, and for
 * recovering a project that was interrupted — states that would otherwise each
 * need their own handling and each be a way to get stuck.
 */
export async function advanceProject(
  db: Db,
  projectId: string,
  providers: Providers = defaultProviders(),
): Promise<void> {
  const { data: project } = await db
    .from("projects")
    .select("*, companies(name)")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return;
  if (!["working", "preparing_final_deliverable"].includes(project.status)) return;

  const metered = meterProviders(providers, db, {
    companyId: project.company_id as string,
    projectId,
  });

  // Loops because finishing one item can unblock the next; stops as soon as a
  // pass changes nothing. The bound is a safety net, not the mechanism.
  for (let pass = 0; pass < 12; pass += 1) {
    const started = await startWhatIsReady(db, projectId, metered);
    await recomputeProgress(db, projectId);
    if (!started) break;
  }

  await maybeFinish(db, projectId, metered);
}

/**
 * Works out which items can now run, and runs them.
 *
 * Items with no unmet dependency run together — they are independent by
 * definition. The one thing that is serialised is a single person: an employee
 * does one thing at a time, so their other ready work waits in "queued" rather
 * than being started alongside.
 */
async function startWhatIsReady(
  db: Db,
  projectId: string,
  providers: Providers,
): Promise<boolean> {
  const items = await loadWorkItems(db, projectId);
  const dependencies = await loadDependencies(db, projectId);
  const byId = new Map(items.map((item) => [item.id, item]));

  const runnable: WorkItemRow[] = [];
  const takenByEmployee = new Set(
    items
      .filter((item) => item.status === "working")
      .map((item) => item.company_employee_id),
  );

  for (const item of items) {
    if (!["planned", "blocked", "queued", "ready"].includes(item.status)) continue;

    const blockers = dependencies.filter((edge) => edge.work_item_id === item.id);
    const unmet = blockers.filter((edge) => {
      const source = byId.get(edge.depends_on_work_item_id);
      if (!source) return false;
      if (source.status === "completed") return false;
      // An optional dependency that failed does not hold anything up; the brief
      // records that it is missing.
      if (!edge.is_required && ["failed", "skipped", "cancelled"].includes(source.status)) {
        return false;
      }
      return true;
    });

    const deadBlocker = blockers.some((edge) => {
      const source = byId.get(edge.depends_on_work_item_id);
      return (
        edge.is_required &&
        source &&
        ["failed", "cancelled", "skipped"].includes(source.status)
      );
    });

    if (deadBlocker) {
      // Never became possible, rather than went wrong. Skipped says that.
      await setStatus(db, item.id, "skipped");
      continue;
    }

    if (unmet.length > 0) {
      if (item.status !== "blocked") await setStatus(db, item.id, "blocked");
      continue;
    }

    runnable.push(item);
  }

  // Highest priority first, then the plan's own order — so a person with two
  // startable items begins the one that matters most.
  runnable.sort((a, b) => {
    const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
    return byPriority !== 0 ? byPriority : a.sequence_order - b.sequence_order;
  });

  const starting: WorkItemRow[] = [];

  for (const item of runnable) {
    if (takenByEmployee.has(item.company_employee_id)) {
      if (item.status !== "queued") await setStatus(db, item.id, "queued");
      continue;
    }
    takenByEmployee.add(item.company_employee_id);
    starting.push(item);
  }

  if (starting.length === 0) return false;

  await Promise.all(
    starting.map((item) => runWorkItem(db, projectId, item, providers)),
  );

  return true;
}

function priorityRank(priority: string): number {
  if (priority === "high") return 0;
  if (priority === "normal") return 1;
  return 2;
}

/**
 * Takes one work item from ready to finished.
 *
 * The dependency inputs are frozen into the assignment before it starts, so a
 * later revision of the work it built on cannot retroactively change what this
 * employee was told.
 */
async function runWorkItem(
  db: Db,
  projectId: string,
  item: WorkItemRow,
  providers: Providers,
): Promise<void> {
  // The department gets the last word on who does this. Planning named a
  // likely person, but by the time the work actually starts they may be busy
  // and a colleague in the same department free — a real department reassigns
  // rather than making the work wait on one named individual.
  const staffed = await confirmAssignee(db, item);

  await setStatus(db, staffed.id, "working", {
    started_at: new Date().toISOString(),
    company_employee_id: staffed.company_employee_id,
  });

  try {
    const assignmentId = await ensureAssignment(db, projectId, staffed);
    if (assignmentId && staffed.department_id) {
      await markQueuedAssigned(db, staffed.id, assignmentId);
    }
    if (!assignmentId) {
      await failWorkItem(db, staffed, "ASSIGNMENT_FAILED", "could not create the assignment");
      return;
    }

    const ok = await runAssignment(db, assignmentId, providers);
    if (!ok) {
      await failWorkItem(db, staffed, "WORK_FAILED", "the employee could not finish");
      return;
    }

    const { data: deliverable } = await db
      .from("deliverables")
      .select("id, deliverable_type, content_json, content_markdown")
      .eq("assignment_id", assignmentId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!deliverable) {
      await failWorkItem(db, staffed, "NO_DELIVERABLE", "no deliverable was produced");
      return;
    }

    await setStatus(db, staffed.id, "awaiting_internal_review");

    // Summarised before completion, because the summary is what a waiting
    // colleague will be handed — an item marked done without one would unblock
    // work that then has nothing to build on.
    const summary = await summarizeWorkItem(db, providers, {
      companyId: staffed.company_id,
      projectId,
      workItemId: staffed.id,
      objective: staffed.objective,
      deliverableId: deliverable.id as string,
      deliverableMarkdown: (deliverable.content_markdown as string) ?? "",
    });

    const now = new Date().toISOString();

    await db
      .from("project_work_items")
      .update({
        status: "completed",
        latest_deliverable_id: deliverable.id,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", staffed.id);

    // Project work is finished when it is handed in. The manager reviews the
    // project, so waiting for a review of each piece would leave every employee
    // blocked for ever.
    await db
      .from("assignments")
      .update({ status: "completed", completed_at: now })
      .eq("id", assignmentId);

    await db
      .from("deliverables")
      .update({ status: "approved", approved_at: now })
      .eq("id", deliverable.id as string);

    await releaseEmployee(db, staffed.company_employee_id);

    if (staffed.department_id) await markQueuedCompleted(db, staffed.id);

    await storeOutputsForDependents(db, projectId, staffed, {
      deliverableId: deliverable.id as string,
      deliverableType: deliverable.deliverable_type as string,
      contentJson: deliverable.content_json,
      summary,
    });
  } catch (error) {
    await failWorkItem(
      db,
      staffed,
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : undefined,
    );
  }
}

/** One assignment per work item, so a retry reuses the row rather than
 *  creating a second one. */
async function ensureAssignment(
  db: Db,
  projectId: string,
  item: WorkItemRow,
): Promise<string | null> {
  if (item.assignment_id) return item.assignment_id;

  const definition = employeeDefinitionFor(db, item);
  const inputs = await loadInputsFor(db, item.id);

  const { data: project } = await db
    .from("projects")
    .select("priority")
    .eq("id", projectId)
    .maybeSingle();

  const roleInput = {
    ...item.role_input_json,
    ...(inputs.length > 0
      ? {
          // Named so a skill's prompt can render it as "what a colleague
          // already established" rather than as the manager's instructions.
          dependencyInputs: inputs.map((input) => ({
            from: input.source_title,
            inputType: input.input_type,
            text: input.input_text,
            data: input.input_json,
          })),
        }
      : {}),
  };

  const { data: assignment } = await db
    .from("assignments")
    .insert({
      company_id: item.company_id,
      company_employee_id: item.company_employee_id,
      title: item.title.slice(0, 200),
      description: buildDescription(item, inputs),
      expected_outcome: item.expected_outcome?.slice(0, 2000) ?? null,
      priority: item.priority || project?.priority || "normal",
      status: "assigned",
      current_progress_step: "assignment_received",
      role_input_schema_id: (await definition)?.assignmentInputSchemaId ?? null,
      role_input_json: roleInput,
      assignment_type: "project",
      assignment_scope: "project",
      // Recorded on the work, so a finished report is still attributable to
      // Marketing after the person who wrote it has moved departments.
      department_id: item.department_id,
      project_id: projectId,
      project_work_item_id: item.id,
      source_type: "manual",
    })
    .select("id")
    .maybeSingle();

  if (!assignment) return null;

  const assignmentId = assignment.id as string;
  const now = new Date().toISOString();

  await db.from("assignment_progress_events").insert(
    initialProgressSteps.map((step, index) => ({
      assignment_id: assignmentId,
      event_type: step.eventType,
      title: step.title,
      sequence: index,
      status: index === 0 ? "completed" : "pending",
      completed_at: index === 0 ? now : null,
    })),
  );

  await db
    .from("project_work_items")
    .update({ assignment_id: assignmentId, updated_at: now })
    .eq("id", item.id);

  return assignmentId;
}

async function employeeDefinitionFor(db: Db, item: WorkItemRow) {
  const { data } = await db
    .from("company_employees")
    .select("employees(slug)")
    .eq("id", item.company_employee_id)
    .maybeSingle();

  const slug = (data as unknown as { employees: { slug: string } | null } | null)
    ?.employees?.slug;
  return slug ? getEmployeeDefinition(slug) : undefined;
}

/** The brief the employee reads. A colleague's findings go in the description
 *  as well as the role input, because the description is what the model reads
 *  as the actual ask. */
function buildDescription(
  item: WorkItemRow,
  inputs: { source_title: string; input_text: string | null }[],
): string {
  const parts = [item.objective];

  if (inputs.length > 0) {
    parts.push(
      "",
      "## What a colleague has already established",
      ...inputs.map((input) =>
        [`From ${input.source_title}:`, input.input_text ?? ""].join("\n"),
      ),
      "",
      "Build on this rather than repeating it.",
    );
  }

  return parts.join("\n").slice(0, 5000);
}

async function loadInputsFor(db: Db, workItemId: string) {
  const { data } = await db
    .from("project_work_item_inputs")
    .select(
      "input_type, input_text, input_json, project_work_items!project_work_item_inputs_source_work_item_id_fkey(title)",
    )
    .eq("work_item_id", workItemId);

  return ((data ?? []) as unknown as {
    input_type: string;
    input_text: string | null;
    input_json: unknown;
    project_work_items: { title: string } | null;
  }[]).map((row) => ({
    input_type: row.input_type,
    input_text: row.input_text,
    input_json: row.input_json,
    source_title: row.project_work_items?.title ?? "a colleague",
  }));
}

/**
 * Freezes this item's output as the input of everything waiting on it.
 *
 * Written at completion rather than read at start, so what a dependent employee
 * receives is fixed at the moment the source finished. If the source is later
 * revised, work already under way keeps the version it was actually given.
 */
async function storeOutputsForDependents(
  db: Db,
  projectId: string,
  item: WorkItemRow,
  produced: {
    deliverableId: string;
    deliverableType: string;
    contentJson: unknown;
    summary: Awaited<ReturnType<typeof summarizeWorkItem>>;
  },
): Promise<void> {
  const { data: edges } = await db
    .from("project_work_item_dependencies")
    .select("work_item_id, input_type")
    .eq("depends_on_work_item_id", item.id);

  const dependents = (edges ?? []) as { work_item_id: string; input_type: string }[];
  if (dependents.length === 0) return;

  const output = extractDependencyOutput(
    produced.deliverableType,
    produced.contentJson,
    produced.summary,
  );

  for (const edge of dependents) {
    await db.from("project_work_item_inputs").upsert(
      {
        company_id: item.company_id,
        project_id: projectId,
        work_item_id: edge.work_item_id,
        source_work_item_id: item.id,
        source_deliverable_id: produced.deliverableId,
        input_type: edge.input_type,
        input_json: output.json as never,
        input_text: output.text,
      },
      {
        onConflict:
          "work_item_id,source_work_item_id,source_deliverable_id,input_type",
      },
    );
  }
}

async function runAssignment(
  db: Db,
  assignmentId: string,
  providers: Providers,
): Promise<boolean> {
  const { data: assignment } = await db
    .from("assignments")
    .select("id, company_id, company_employee_id")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!assignment) return false;

  const { data: created } = await db
    .from("work_executions")
    .insert({
      company_id: assignment.company_id,
      assignment_id: assignmentId,
      company_employee_id: assignment.company_employee_id,
      status: "queued",
      current_step: "context_loaded",
      attempt_number: 1,
    })
    .select("id")
    .maybeSingle();

  if (!created) return false;

  await db
    .from("assignments")
    .update({ status: "queued", last_execution_id: created.id as string })
    .eq("id", assignmentId);

  const result = await executeEmployeeAssignment(
    created.id as string,
    providers,
    db as unknown as Parameters<typeof executeEmployeeAssignment>[2],
  );

  return result.ok;
}

/**
 * Decides whether the project is done, stuck, or still waiting.
 *
 * Required work failing stops the project; optional work failing does not, and
 * is reported as a limitation instead. That asymmetry is the whole reason the
 * plan marks items required in the first place.
 */
async function maybeFinish(
  db: Db,
  projectId: string,
  providers: Providers,
): Promise<void> {
  const items = await loadWorkItems(db, projectId);
  const required = items.filter((item) => item.required_for_project_completion);

  const requiredFailed = required.filter((item) =>
    ["failed", "skipped", "cancelled"].includes(item.status),
  );

  if (requiredFailed.length > 0) {
    await failProject(db, projectId, "REQUIRED_WORK_FAILED");
    return;
  }

  const stillGoing = items.some((item) =>
    ["planned", "ready", "blocked", "queued", "working", "awaiting_internal_review"].includes(
      item.status,
    ),
  );
  if (stillGoing) return;

  const completed = items.filter((item) => item.status === "completed");
  if (completed.length === 0) {
    await failProject(db, projectId, "REQUIRED_WORK_FAILED");
    return;
  }

  const { data: existing } = await db
    .from("deliverables")
    .select("id")
    .eq("project_id", projectId)
    .eq("deliverable_scope", "project")
    .in("status", ["submitted", "approved"])
    .maybeSingle();

  // Already produced. Reaching here twice is normal — two passes can both see
  // the last item finish — and must not write a second brief.
  if (existing) return;

  await db
    .from("projects")
    .update({
      status: "preparing_final_deliverable",
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("status", "working");

  const merged = await prepareProjectDeliverable(db, projectId, providers);

  if (!merged.ok) {
    await failProject(db, projectId, "FINAL_DELIVERABLE_FAILED");
    return;
  }

  const now = new Date().toISOString();
  await db
    .from("projects")
    .update({
      status: "awaiting_review",
      final_deliverable_id: merged.deliverableId,
      progress_percentage: 100,
      submitted_at: now,
      updated_at: now,
    })
    .eq("id", projectId);
}

/**
 * Progress, computed rather than reported.
 *
 * A model asked how far along it is will guess, and the guess will be
 * confident. This is arithmetic on states the system actually recorded.
 */
export async function recomputeProgress(db: Db, projectId: string): Promise<number> {
  const items = await loadWorkItems(db, projectId);
  if (items.length === 0) return 0;

  const total = items.reduce(
    (sum, item) => sum + (workItemProgressWeight[item.status] ?? 0),
    0,
  );

  // Capped below 100 while work items are all that's finished: the brief still
  // has to be written, and showing 100% before the manager has anything to read
  // would be a lie.
  const raw = Math.round(total / items.length);
  const progress = Math.min(raw, 90);

  await db
    .from("projects")
    .update({ progress_percentage: progress, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .neq("status", "completed");

  return progress;
}

async function loadWorkItems(db: Db, projectId: string): Promise<WorkItemRow[]> {
  const { data } = await db
    .from("project_work_items")
    .select("*")
    .eq("project_id", projectId)
    .order("sequence_order", { ascending: true });

  return (data ?? []) as WorkItemRow[];
}

async function loadDependencies(db: Db, projectId: string) {
  const { data } = await db
    .from("project_work_item_dependencies")
    .select("work_item_id, depends_on_work_item_id, is_required, input_type")
    .eq("project_id", projectId);

  return (data ?? []) as {
    work_item_id: string;
    depends_on_work_item_id: string;
    is_required: boolean;
    input_type: string;
  }[];
}

async function setStatus(
  db: Db,
  workItemId: string,
  status: WorkItemStatus,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await db
    .from("project_work_items")
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq("id", workItemId);
}

async function failWorkItem(
  db: Db,
  item: WorkItemRow,
  code: string,
  message?: string,
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .from("project_work_items")
    .update({
      status: "failed",
      failure_code: code,
      failure_message: message?.slice(0, 500) ?? null,
      failed_at: now,
      updated_at: now,
    })
    .eq("id", item.id);

  // A failed run marks the employee blocked, which is right for work the
  // manager is waiting on and wrong here — the project either carries on
  // without this piece or stops, and either way nobody is still expecting it.
  await releaseEmployee(db, item.company_employee_id);
}

async function releaseEmployee(db: Db, companyEmployeeId: string): Promise<void> {
  await db
    .from("company_employees")
    .update({ work_status: "ready", current_assignment_id: null })
    .eq("id", companyEmployeeId);
}

async function failProject(
  db: Db,
  projectId: string,
  code: ProjectFailureCode,
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .from("projects")
    .update({
      status: "failed",
      failure_code: code,
      failed_at: now,
      updated_at: now,
    })
    .eq("id", projectId)
    .in("status", ["working", "preparing_final_deliverable"]);
}
