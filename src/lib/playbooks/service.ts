import type { SupabaseClient } from "@supabase/supabase-js";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import type { Result } from "@/lib/assignments/service";
import { getPolicyCheck } from "@/lib/policies/checks";
import { getPlaybookTemplate } from "@/lib/playbooks/catalog";
import {
  MAX_QUALITY_CHECKS,
  MAX_STAGES,
  MAX_STEPS_PER_STAGE,
  PLAYBOOK_DESCRIPTION_MAX,
  PLAYBOOK_NAME_MAX,
  STAGE_TITLE_MAX,
  STEP_INSTRUCTION_MAX,
  STEP_INSTRUCTION_MIN,
  type Playbook,
  type PlaybookQualityCheck,
  type PlaybookStage,
  type PlaybookStatus,
  type PlaybookStep,
} from "@/lib/playbooks/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

interface PlaybookRow {
  id: string;
  company_id: string;
  department_id: string | null;
  skill_id: string | null;
  name: string;
  description: string;
  status: string;
  version: number;
  updated_at: string;
}

// --- Reading -------------------------------------------------------------

export async function loadPlaybooks(
  db: Db,
  companyId: string,
): Promise<Playbook[]> {
  const { data: rows } = await db
    .from("playbooks")
    .select("*, departments(name)")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  const playbooks = (rows ?? []) as unknown as (PlaybookRow & {
    departments: { name: string } | null;
  })[];

  if (playbooks.length === 0) return [];

  const ids = playbooks.map((row) => row.id);

  const { data: stageRows } = await db
    .from("playbook_stages")
    .select("*")
    .in("playbook_id", ids)
    .order("order_index", { ascending: true });

  const stages = (stageRows ?? []) as {
    id: string;
    playbook_id: string;
    title: string;
    intent: string;
    order_index: number;
  }[];

  const { data: stepRows } = stages.length
    ? await db
        .from("playbook_steps")
        .select("*")
        .in(
          "stage_id",
          stages.map((stage) => stage.id),
        )
        .order("order_index", { ascending: true })
    : { data: [] };

  const { data: checkRows } = await db
    .from("playbook_quality_checks")
    .select("*")
    .in("playbook_id", ids)
    .order("order_index", { ascending: true });

  const stepsByStage = new Map<string, PlaybookStep[]>();
  for (const row of (stepRows ?? []) as {
    id: string;
    stage_id: string;
    instruction: string;
    expected_output: string;
    required: boolean;
    order_index: number;
  }[]) {
    const list = stepsByStage.get(row.stage_id) ?? [];
    list.push({
      id: row.id,
      instruction: row.instruction,
      expectedOutput: row.expected_output,
      required: row.required,
      orderIndex: row.order_index,
    });
    stepsByStage.set(row.stage_id, list);
  }

  const stagesByPlaybook = new Map<string, PlaybookStage[]>();
  for (const stage of stages) {
    const list = stagesByPlaybook.get(stage.playbook_id) ?? [];
    list.push({
      id: stage.id,
      title: stage.title,
      intent: stage.intent,
      orderIndex: stage.order_index,
      steps: stepsByStage.get(stage.id) ?? [],
    });
    stagesByPlaybook.set(stage.playbook_id, list);
  }

  const checksByPlaybook = new Map<string, PlaybookQualityCheck[]>();
  for (const row of (checkRows ?? []) as {
    id: string;
    playbook_id: string;
    title: string;
    description: string;
    check_id: string | null;
    check_config: Record<string, unknown> | null;
    order_index: number;
  }[]) {
    const list = checksByPlaybook.get(row.playbook_id) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      description: row.description,
      checkId: row.check_id,
      checkConfig: row.check_config ?? {},
      orderIndex: row.order_index,
    });
    checksByPlaybook.set(row.playbook_id, list);
  }

  return playbooks.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as PlaybookStatus,
    version: row.version,
    departmentId: row.department_id,
    departmentName: row.departments?.name ?? null,
    skillId: row.skill_id,
    updatedAt: row.updated_at,
    stages: stagesByPlaybook.get(row.id) ?? [],
    qualityChecks: checksByPlaybook.get(row.id) ?? [],
  }));
}

export async function loadPlaybookDetail(playbookId: string): Promise<{
  playbook: Playbook;
  history: { version: number; changeSummary: string; createdAt: string }[];
  departments: { id: string; name: string }[];
  timesUsed: number;
} | null> {
  const context = await getCompanyContext();
  if (!context) return null;

  const { supabase, companyId } = context;

  const playbook = (await loadPlaybooks(supabase, companyId)).find(
    (row) => row.id === playbookId,
  );
  if (!playbook) return null;

  const { data: versionRows } = await supabase
    .from("playbook_versions")
    .select("version, change_summary, created_at")
    .eq("playbook_id", playbookId)
    .order("version", { ascending: false });

  const { data: departmentRows } = await supabase
    .from("departments")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  const { count } = await supabase
    .from("assignment_playbook_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("playbook_id", playbookId);

  return {
    playbook,
    history: ((versionRows ?? []) as {
      version: number;
      change_summary: string;
      created_at: string;
    }[]).map((row) => ({
      version: row.version,
      changeSummary: row.change_summary,
      createdAt: row.created_at,
    })),
    departments: (departmentRows ?? []) as { id: string; name: string }[],
    timesUsed: count ?? 0,
  };
}

/** The numbers on the dashboard card. */
export async function loadPlaybookSummary(
  db: Db,
  companyId: string,
): Promise<{ activeCount: number; mostUsed: string | null }> {
  const { data: rows } = await db
    .from("playbooks")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("status", "active");

  const playbooks = (rows ?? []) as { id: string; name: string }[];
  if (playbooks.length === 0) return { activeCount: 0, mostUsed: null };

  const { data: uses } = await db
    .from("assignment_playbook_snapshots")
    .select("playbook_id")
    .eq("company_id", companyId);

  const counts = new Map<string, number>();
  for (const row of (uses ?? []) as { playbook_id: string | null }[]) {
    if (!row.playbook_id) continue;
    counts.set(row.playbook_id, (counts.get(row.playbook_id) ?? 0) + 1);
  }

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    activeCount: playbooks.length,
    mostUsed: top ? (playbooks.find((p) => p.id === top[0])?.name ?? null) : null,
  };
}

// --- Versioning ----------------------------------------------------------

/**
 * Records the method as published, whole.
 *
 * Written on publish rather than on every edit. A half-written draft is not a
 * version of how the company works — it is somebody still deciding.
 */
async function recordVersion(
  db: Db,
  companyId: string,
  playbookId: string,
  changeSummary: string,
): Promise<void> {
  const playbook = (await loadPlaybooks(db, companyId)).find(
    (row) => row.id === playbookId,
  );
  if (!playbook) return;

  await db.from("playbook_versions").insert({
    company_id: companyId,
    playbook_id: playbookId,
    version: playbook.version,
    name: playbook.name,
    description: playbook.description,
    body_json: {
      stages: playbook.stages,
      qualityChecks: playbook.qualityChecks,
    },
    change_summary: changeSummary,
  });
}

// --- Writing -------------------------------------------------------------

export interface CreatePlaybookInput {
  templateKey?: string;
  name?: string;
  description?: string;
  departmentId?: string | null;
  skillId?: string | null;
}

export async function createPlaybook(
  input: CreatePlaybookInput,
): Promise<Result<{ playbookId: string }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Create a company first.", status: 400 };

  const { supabase, companyId } = context;

  const template = input.templateKey
    ? getPlaybookTemplate(input.templateKey)
    : undefined;

  if (input.templateKey && !template) {
    return { error: "That isn't a method I know.", status: 404 };
  }

  const name = (input.name ?? template?.name ?? "").trim();
  const description = (input.description ?? template?.description ?? "").trim();
  const skillId = input.skillId ?? template?.skillId ?? null;

  if (name.length === 0 || name.length > PLAYBOOK_NAME_MAX) {
    return {
      error: `Give this playbook a name of up to ${PLAYBOOK_NAME_MAX} characters.`,
      status: 400,
    };
  }
  if (description.length > PLAYBOOK_DESCRIPTION_MAX) {
    return {
      error: `Keep the description under ${PLAYBOOK_DESCRIPTION_MAX} characters.`,
      status: 400,
    };
  }

  // Where the manager didn't say, the department that owns the skill does —
  // that is already a settled question in the organisation, so asking again
  // would just be a chance to answer it inconsistently.
  let departmentId = input.departmentId ?? null;
  if (!departmentId && skillId) {
    const { data: owner } = await supabase
      .from("department_skills")
      .select("department_id")
      .eq("company_id", companyId)
      .eq("skill_id", skillId)
      .maybeSingle();
    departmentId = (owner?.department_id as string | undefined) ?? null;
  }

  const { data: created, error } = await supabase
    .from("playbooks")
    .insert({
      company_id: companyId,
      department_id: departmentId,
      skill_id: skillId,
      name,
      description,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !created) {
    if (error?.code === "23505") {
      return { error: "You already have a playbook with that name.", status: 409 };
    }
    return { error: "I couldn't create this playbook.", status: 500 };
  }

  const playbookId = created.id as string;

  if (template) {
    for (const [stageIndex, stage] of template.stages.entries()) {
      const { data: createdStage } = await supabase
        .from("playbook_stages")
        .insert({
          company_id: companyId,
          playbook_id: playbookId,
          title: stage.title,
          intent: stage.intent,
          order_index: stageIndex,
        })
        .select("id")
        .single();

      if (!createdStage) continue;

      await supabase.from("playbook_steps").insert(
        stage.steps.map((step, stepIndex) => ({
          company_id: companyId,
          stage_id: createdStage.id as string,
          instruction: step.instruction,
          expected_output: step.expectedOutput,
          required: step.required ?? true,
          order_index: stepIndex,
        })),
      );
    }

    if (template.qualityChecks.length > 0) {
      await supabase.from("playbook_quality_checks").insert(
        template.qualityChecks.map((check, index) => ({
          company_id: companyId,
          playbook_id: playbookId,
          title: check.title,
          description: check.description,
          check_id: check.checkId ?? null,
          check_config: check.checkConfig ?? {},
          order_index: index,
        })),
      );
    }
  }

  return { playbookId };
}

export interface UpdatePlaybookInput {
  name?: string;
  description?: string;
  status?: string;
  departmentId?: string | null;
}

export async function updatePlaybook(
  playbookId: string,
  input: UpdatePlaybookInput,
): Promise<Result<{ ok: true }>> {
  const owned = await ownedPlaybook(playbookId);
  if (!owned) return { error: "Playbook not found.", status: 404 };

  const { supabase } = owned;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length === 0 || name.length > PLAYBOOK_NAME_MAX) {
      return {
        error: `Give this playbook a name of up to ${PLAYBOOK_NAME_MAX} characters.`,
        status: 400,
      };
    }
    patch.name = name;
  }

  if (input.description !== undefined) {
    if (input.description.length > PLAYBOOK_DESCRIPTION_MAX) {
      return {
        error: `Keep the description under ${PLAYBOOK_DESCRIPTION_MAX} characters.`,
        status: 400,
      };
    }
    patch.description = input.description.trim();
  }

  if (input.status !== undefined) {
    if (!["draft", "archived"].includes(input.status)) {
      // Putting a playbook into use is a publish, not a status edit — it has to
      // take a version with it.
      return {
        error:
          input.status === "active"
            ? "Publish it to put it into use."
            : "That isn't a status I know.",
        status: 400,
      };
    }
    patch.status = input.status;
  }

  if (input.departmentId !== undefined) patch.department_id = input.departmentId;

  const { error } = await supabase
    .from("playbooks")
    .update(patch)
    .eq("id", playbookId);

  if (error) {
    if (error.code === "23505") {
      return { error: "You already have a playbook with that name.", status: 409 };
    }
    return { error: "I couldn't save this change.", status: 500 };
  }

  return { ok: true };
}

/**
 * Puts a method into use.
 *
 * The only path to "active", and the only thing that moves the version. Work
 * already under way keeps the version it started with, so publishing is safe to
 * do while people are working.
 */
export async function publishPlaybook(
  playbookId: string,
  changeSummary: string,
): Promise<Result<{ version: number }>> {
  const owned = await ownedPlaybook(playbookId);
  if (!owned) return { error: "Playbook not found.", status: 404 };

  const { supabase, companyId, row } = owned;

  const playbook = (await loadPlaybooks(supabase, companyId)).find(
    (entry) => entry.id === playbookId,
  );

  if (!playbook || playbook.stages.length === 0) {
    return {
      error: "Add at least one stage before putting this into use.",
      status: 400,
    };
  }

  if (playbook.stages.every((stage) => stage.steps.length === 0)) {
    return {
      error: "A method with no steps doesn't tell anybody anything. Add some.",
      status: 400,
    };
  }

  // First publish is version 1 — the row already carries it, and bumping here
  // would leave the company's first method mysteriously starting at 2.
  const alreadyPublished = row.status === "active" || row.version > 1;
  const version = alreadyPublished ? row.version + 1 : row.version;

  const { error } = await supabase
    .from("playbooks")
    .update({ status: "active", version, updated_at: new Date().toISOString() })
    .eq("id", playbookId);

  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "This department already has a playbook in use for that work. Retire it first.",
        status: 409,
      };
    }
    return { error: "I couldn't publish this playbook.", status: 500 };
  }

  await recordVersion(
    supabase,
    companyId,
    playbookId,
    changeSummary.trim() || (alreadyPublished ? "Republished." : "First published."),
  );

  return { version };
}

// --- Stages, steps and checks --------------------------------------------

export async function addStage(
  playbookId: string,
  title: string,
  intent: string,
): Promise<Result<{ stageId: string }>> {
  const owned = await ownedPlaybook(playbookId);
  if (!owned) return { error: "Playbook not found.", status: 404 };

  const clean = title.trim();
  if (clean.length === 0 || clean.length > STAGE_TITLE_MAX) {
    return { error: `Give this stage a title of up to ${STAGE_TITLE_MAX} characters.`, status: 400 };
  }

  const { supabase, companyId } = owned;

  const { count } = await supabase
    .from("playbook_stages")
    .select("id", { count: "exact", head: true })
    .eq("playbook_id", playbookId);

  if ((count ?? 0) >= MAX_STAGES) {
    return { error: `A playbook holds up to ${MAX_STAGES} stages.`, status: 400 };
  }

  const { data: created, error } = await supabase
    .from("playbook_stages")
    .insert({
      company_id: companyId,
      playbook_id: playbookId,
      title: clean,
      intent: intent.trim(),
      order_index: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !created) return { error: "I couldn't add this stage.", status: 500 };

  return { stageId: created.id as string };
}

export async function addStep(
  stageId: string,
  instruction: string,
  expectedOutput: string,
  required: boolean,
): Promise<Result<{ stepId: string }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Stage not found.", status: 404 };

  const { supabase, companyId } = context;

  const { data: stage } = await supabase
    .from("playbook_stages")
    .select("id")
    .eq("id", stageId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!stage) return { error: "Stage not found.", status: 404 };

  const clean = instruction.trim();
  if (clean.length < STEP_INSTRUCTION_MIN) {
    return { error: `Write the step out in at least ${STEP_INSTRUCTION_MIN} characters.`, status: 400 };
  }
  if (clean.length > STEP_INSTRUCTION_MAX) {
    return { error: `Keep the step under ${STEP_INSTRUCTION_MAX} characters.`, status: 400 };
  }

  const { count } = await supabase
    .from("playbook_steps")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", stageId);

  if ((count ?? 0) >= MAX_STEPS_PER_STAGE) {
    return {
      error: `A stage holds up to ${MAX_STEPS_PER_STAGE} steps. Split it.`,
      status: 400,
    };
  }

  const { data: created, error } = await supabase
    .from("playbook_steps")
    .insert({
      company_id: companyId,
      stage_id: stageId,
      instruction: clean,
      expected_output: expectedOutput.trim(),
      required,
      order_index: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !created) return { error: "I couldn't add this step.", status: 500 };

  return { stepId: created.id as string };
}

export async function addQualityCheck(
  playbookId: string,
  title: string,
  description: string,
  checkId: string | null,
  checkConfig: Record<string, unknown>,
): Promise<Result<{ checkId: string }>> {
  const owned = await ownedPlaybook(playbookId);
  if (!owned) return { error: "Playbook not found.", status: 404 };

  if (!title.trim()) {
    return { error: "Give this check a title.", status: 400 };
  }
  if (checkId && !getPolicyCheck(checkId)) {
    return { error: "That isn't a check I know how to run.", status: 400 };
  }

  const { supabase, companyId } = owned;

  const { count } = await supabase
    .from("playbook_quality_checks")
    .select("id", { count: "exact", head: true })
    .eq("playbook_id", playbookId);

  if ((count ?? 0) >= MAX_QUALITY_CHECKS) {
    return { error: `A playbook holds up to ${MAX_QUALITY_CHECKS} checks.`, status: 400 };
  }

  const { data: created, error } = await supabase
    .from("playbook_quality_checks")
    .insert({
      company_id: companyId,
      playbook_id: playbookId,
      title: title.trim(),
      description: description.trim(),
      check_id: checkId,
      check_config: checkConfig,
      order_index: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !created) return { error: "I couldn't add this check.", status: 500 };

  return { checkId: created.id as string };
}

export async function deleteStage(stageId: string): Promise<Result<{ ok: true }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Stage not found.", status: 404 };

  const { data } = await context.supabase
    .from("playbook_stages")
    .delete()
    .eq("id", stageId)
    .eq("company_id", context.companyId)
    .select("id")
    .maybeSingle();

  if (!data) return { error: "Stage not found.", status: 404 };

  return { ok: true };
}

export async function deleteStep(stepId: string): Promise<Result<{ ok: true }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Step not found.", status: 404 };

  const { data } = await context.supabase
    .from("playbook_steps")
    .delete()
    .eq("id", stepId)
    .eq("company_id", context.companyId)
    .select("id")
    .maybeSingle();

  if (!data) return { error: "Step not found.", status: 404 };

  return { ok: true };
}

async function ownedPlaybook(playbookId: string): Promise<{
  supabase: Db;
  companyId: string;
  row: PlaybookRow;
} | null> {
  const context = await getCompanyContext();
  if (!context) return null;

  const { data } = await context.supabase
    .from("playbooks")
    .select("*")
    .eq("id", playbookId)
    .eq("company_id", context.companyId)
    .maybeSingle();

  if (!data) return null;

  return {
    supabase: context.supabase,
    companyId: context.companyId,
    row: data as PlaybookRow,
  };
}
