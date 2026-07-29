import { createClient } from "@/lib/supabase/server";
import { loadWorkContext, type EmployeeWorkContextV5 } from "@/lib/execution/context";
import {
  defaultProviders,
  ExecutionError,
  setStep,
  type Providers,
  type Supabase,
} from "@/lib/execution/shared";
import {
  recordMemoryUse,
  retrieveMemoriesForAssignment,
  type RetrievedMemory,
} from "@/lib/memory/retrieval";
import { getEmployeeSkill } from "@/lib/skills/registry";
import { loadRecurringHistory } from "@/lib/recurring/history";
import { SkillNotFoundError } from "@/lib/skills/types";
import { executionStepLabel, type ExecutionErrorCode } from "@/lib/execution/types";
import { meterProviders } from "@/lib/costs/meter";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import { ensureAssignmentPolicySnapshot } from "@/lib/policies/resolve";
import { ensureAssignmentPlaybookSnapshot } from "@/lib/playbooks/resolve";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { recordPolicyFindings } from "@/lib/policies/validation";

export { defaultProviders };
export type { Providers };

/**
 * Runs one assignment end to end.
 *
 * Everything here is the same for every employee: marking the run started,
 * loading what the employee knows, recalling what they've learned, and
 * recording failure honestly. The part that differs — how the work is actually
 * done and what gets handed in — belongs to the employee's skill, which this
 * function selects by id and never inspects.
 */
export async function executeEmployeeAssignment(
  executionId: string,
  providers: Providers = defaultProviders(),
  /** Supplied by the scheduler, which runs on a timer and has no session to
   *  build a client from. Everything else uses the caller's own client, where
   *  row level security is doing the access check. */
  db?: Supabase,
): Promise<{ ok: true; deliverableId: string } | { ok: false; code: ExecutionErrorCode }> {
  const supabase = db ?? (await createClient());

  const { data: execution } = await supabase
    .from("work_executions")
    .select("*")
    .eq("id", executionId)
    .maybeSingle();

  if (!execution) {
    return { ok: false, code: "UNKNOWN_ERROR" };
  }

  // Before anything is spent. Checked here rather than inside the provider
  // because a run stopped halfway leaves a half-written deliverable and an
  // employee stuck mid-assignment — worse for the manager than the small
  // overshoot of letting a started piece of work finish.
  const blocked = await blockedBySpendLimit(supabase, execution.company_id);
  if (blocked) {
    await supabase.rpc("fail_work_execution", {
      p_execution_id: executionId,
      p_error_code: "SPEND_LIMIT_REACHED",
      p_error_message: blocked,
    });
    return { ok: false, code: "SPEND_LIMIT_REACHED" };
  }

  // Every model call this run makes — whatever skill makes it, and whether or
  // not the skill knows it is being counted — is recorded against this run.
  providers = meterProviders(providers, supabase, {
    companyId: execution.company_id,
    workExecutionId: executionId,
    companyEmployeeId: execution.company_employee_id,
  });

  try {
    await supabase
      .from("work_executions")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        model_provider: providers.ai.name,
        model_name: providers.ai.model,
      })
      .eq("id", executionId);

    await supabase
      .from("assignments")
      .update({ status: "working", started_at: new Date().toISOString() })
      .eq("id", execution.assignment_id);

    await supabase
      .from("company_employees")
      .update({ work_status: "working" })
      .eq("id", execution.company_employee_id);

    // Before the context is assembled, so the employee is given the standard
    // and judged by the same one. Taken once per assignment: a retry or a
    // revision inherits the rules the work started under.
    await ensureAssignmentPolicySnapshot(
      supabase,
      execution.company_id,
      execution.assignment_id,
      execution.company_employee_id,
    );

    // The method is chosen by the work, so the skill has to be known before the
    // context is assembled — the context reads the snapshot rather than taking
    // one, which is what keeps a read path from deciding how work was done.
    const skillId = await skillForHire(supabase, execution.company_employee_id);
    if (skillId) {
      await ensureAssignmentPlaybookSnapshot(
        supabase,
        execution.company_id,
        execution.assignment_id,
        skillId,
        execution.company_employee_id,
      );
    }

    const context = await loadContextOrFail(
      supabase,
      executionId,
      execution.assignment_id,
    );

    const memories = await recallMemories(executionId, context, supabase);

    const skill = getEmployeeSkill(context.skillId);

    // Only recurring work has a previous turn to build on. A one-off assignment
    // has no history and should not be told about unrelated past work.
    const { data: assignment } = await supabase
      .from("assignments")
      .select("recurring_assignment_id, assignment_type")
      .eq("id", execution.assignment_id)
      .maybeSingle();

    const recurringId = assignment?.recurring_assignment_id as string | null;
    const rawType = assignment?.assignment_type;
    const assignmentType =
      rawType === "internal" || rawType === "project" ? rawType : "manager";
    const history = recurringId
      ? await loadRecurringHistory(recurringId, execution.assignment_id, supabase)
      : undefined;

    const result = await skill.run({
      supabase,
      executionId,
      execution: {
        company_id: execution.company_id,
        assignment_id: execution.assignment_id,
        company_employee_id: execution.company_employee_id,
      },
      providers,
      context,
      memories,
      history,
      assignmentType,
      runChildAssignment: (childId) =>
        runChildAssignment(supabase, providers, childId),
    });

    await supabase
      .from("work_executions")
      .update({ metrics_json: result.metrics })
      .eq("id", executionId);

    // After the deliverable exists, never instead of it. Work that misses the
    // company's standard is still work the manager should see — the finding
    // tells them what is wrong with it, and a failed run would tell them
    // nothing.
    try {
      await recordPolicyFindings(
        supabase,
        execution.company_id,
        execution.assignment_id,
        result.deliverableId,
      );
    } catch {
      // The deliverable stands. An unchecked one is better than a lost one.
    }

    return { ok: true, deliverableId: result.deliverableId };
  } catch (error) {
    const code =
      error instanceof ExecutionError
        ? error.code
        : error instanceof SkillNotFoundError
          ? ("CONTEXT_INCOMPLETE" as const)
          : ("UNKNOWN_ERROR" as const);
    const message = error instanceof Error ? error.message : String(error);

    await supabase.rpc("fail_work_execution", {
      p_execution_id: executionId,
      p_error_code: code,
      // Kept server-side for debugging; never rendered to the user.
      p_error_message: message.slice(0, 500),
    });

    return { ok: false, code };
  }
}

/** Which kind of work this employee does, by their definition rather than by
 *  their name. */
async function skillForHire(
  db: Supabase,
  companyEmployeeId: string,
): Promise<string | null> {
  const { data } = await db
    .from("company_employees")
    .select("employees(slug)")
    .eq("id", companyEmployeeId)
    .maybeSingle();

  const slug = (data as unknown as { employees: { slug: string } | null } | null)
    ?.employees?.slug;

  return slug ? (getEmployeeDefinition(slug)?.skillId ?? null) : null;
}

async function loadContextOrFail(
  supabase: Supabase,
  executionId: string,
  assignmentId: string,
): Promise<EmployeeWorkContextV5> {
  await setStep(supabase, executionId, "context_loaded");

  const result = await loadWorkContext(assignmentId, supabase);
  if (!result.ok) {
    throw new ExecutionError(
      "CONTEXT_INCOMPLETE",
      `missing: ${result.missing.join(", ")}`,
    );
  }

  // Reading the company's knowledge profile *is* the "company context
  // reviewed" step, so close it here rather than leaving a pending marker
  // stranded between completed ones.
  await supabase
    .from("assignment_progress_events")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("assignment_id", assignmentId)
    .eq("event_type", "company_context_reviewed")
    .neq("status", "completed");

  // Snapshot the inputs so a later edit to company knowledge doesn't rewrite
  // the record of why this deliverable said what it said.
  await supabase
    .from("work_executions")
    .update({
      input_snapshot: {
        capturedAt: new Date().toISOString(),
        employee: result.context.employee,
        company: result.context.company,
        companyKnowledge: result.context.companyKnowledge,
        roleKnowledge: result.context.roleKnowledge,
        assignment: result.context.assignment,
        roleInput: result.context.roleInput,
      },
    })
    .eq("id", executionId);

  return result.context;
}

/**
 * Runs work one employee is doing for another.
 *
 * The same engine, recursively — a colleague's assignment is an ordinary
 * assignment with an ordinary execution, and gets the same evidence rules and
 * the same skill. What stops this recursing without end is upstream: only a
 * manager-facing assignment is allowed to ask for help in the first place.
 */
async function runChildAssignment(
  supabase: Supabase,
  providers: Providers,
  childAssignmentId: string,
): Promise<boolean> {
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, company_id, company_employee_id")
    .eq("id", childAssignmentId)
    .maybeSingle();

  if (!assignment) return false;

  const { data: created } = await supabase
    .from("work_executions")
    .insert({
      company_id: assignment.company_id,
      assignment_id: childAssignmentId,
      company_employee_id: assignment.company_employee_id,
      status: "queued",
      current_step: "context_loaded",
      attempt_number: 1,
    })
    .select("id")
    .single();

  if (!created) return false;

  await supabase
    .from("assignments")
    .update({ status: "queued", last_execution_id: created.id as string })
    .eq("id", childAssignmentId);

  const result = await executeEmployeeAssignment(
    created.id as string,
    providers,
    supabase,
  );

  return result.ok;
}

/**
 * Recalls what this employee has learned. Deliberately swallowing failures:
 * being unable to remember is not a reason to refuse work the employee could
 * otherwise do.
 */
async function recallMemories(
  executionId: string,
  context: EmployeeWorkContextV5,
  db: Supabase,
): Promise<RetrievedMemory[]> {
  try {
    const memories = await retrieveMemoriesForAssignment(
      {
        companyEmployeeId: context.employee.id,
        assignmentTitle: context.assignment.title,
        assignmentDescription: context.assignment.description,
        expectedOutcome: context.assignment.expectedOutcome,
      },
      db,
    );
    await recordMemoryUse(executionId, memories, db);
    return memories;
  } catch {
    return [];
  }
}

export { executionStepLabel };
