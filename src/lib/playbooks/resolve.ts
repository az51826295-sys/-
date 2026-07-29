import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPlaybooks } from "@/lib/playbooks/service";
import type { PlaybookSnapshot } from "@/lib/playbooks/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

/**
 * The method this company uses for this kind of work.
 *
 * Matched on the department that owns the work and the skill it takes. A
 * company with no playbook for it gets nothing — the employee falls back on
 * their professional judgement, which is what they did before the manager
 * wrote a method down, and is a perfectly good answer.
 */
export async function resolvePlaybook(
  db: Db,
  companyId: string,
  skillId: string,
  companyEmployeeId: string | null,
): Promise<PlaybookSnapshot | null> {
  const playbooks = (await loadPlaybooks(db, companyId)).filter(
    (playbook) => playbook.status === "active" && playbook.skillId === skillId,
  );

  if (playbooks.length === 0) return null;

  let departmentId: string | null = null;

  if (companyEmployeeId) {
    const { data: membership } = await db
      .from("department_members")
      .select("department_id")
      .eq("company_employee_id", companyEmployeeId)
      .maybeSingle();

    departmentId = (membership?.department_id as string | undefined) ?? null;
  }

  // The employee's own department first. A playbook belonging to nobody in
  // particular still applies — that is a company-wide method — but one written
  // by the department doing the work wins over it.
  const chosen =
    playbooks.find(
      (playbook) => departmentId && playbook.departmentId === departmentId,
    ) ?? playbooks.find((playbook) => playbook.departmentId === null);

  if (!chosen) return null;

  // Read from what was published, not from the rows as they stand now.
  //
  // Editing an active playbook is somebody drafting the next version. If the
  // live rows reached the employee, a half-finished edit would change how work
  // is done the moment it was typed, and the snapshot would record a version
  // number whose content it does not actually contain.
  const { data: published } = await db
    .from("playbook_versions")
    .select("version, name, body_json")
    .eq("playbook_id", chosen.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!published) return null;

  const body = (published.body_json ?? {}) as {
    stages?: {
      title: string;
      intent: string;
      steps: { instruction: string; expectedOutput: string; required: boolean }[];
    }[];
    qualityChecks?: {
      title: string;
      description: string;
      checkId: string | null;
      checkConfig: Record<string, unknown>;
    }[];
  };

  return {
    capturedAt: new Date().toISOString(),
    playbookId: chosen.id,
    name: published.name as string,
    version: published.version as number,
    stages: (body.stages ?? []).map((stage) => ({
      title: stage.title,
      intent: stage.intent,
      steps: (stage.steps ?? []).map((step) => ({
        instruction: step.instruction,
        expectedOutput: step.expectedOutput,
        required: step.required,
      })),
    })),
    qualityChecks: (body.qualityChecks ?? []).map((check) => ({
      title: check.title,
      description: check.description,
      checkId: check.checkId,
      checkConfig: check.checkConfig ?? {},
    })),
  };
}

/**
 * Fixes the method this assignment is worked to, once.
 *
 * Same rule as the company's standards: publishing a new version while somebody
 * is halfway through must not change the steps they were given. A retry or a
 * revision inherits what the work started under.
 */
export async function ensureAssignmentPlaybookSnapshot(
  db: Db,
  companyId: string,
  assignmentId: string,
  skillId: string,
  companyEmployeeId: string | null,
): Promise<PlaybookSnapshot | null> {
  const { data: existing } = await db
    .from("assignment_playbook_snapshots")
    .select("playbook_snapshot_json")
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  if (existing?.playbook_snapshot_json) {
    return existing.playbook_snapshot_json as PlaybookSnapshot;
  }

  const snapshot = await resolvePlaybook(
    db,
    companyId,
    skillId,
    companyEmployeeId,
  );

  // Nothing recorded when there is no method. An empty row would make the
  // deliverable claim it followed a playbook that does not exist.
  if (!snapshot) return null;

  await db.from("assignment_playbook_snapshots").insert({
    company_id: companyId,
    assignment_id: assignmentId,
    playbook_id: snapshot.playbookId,
    playbook_name: snapshot.name,
    playbook_version: snapshot.version,
    playbook_snapshot_json: snapshot,
  });

  return snapshot;
}

export async function loadAssignmentPlaybookSnapshot(
  db: Db,
  assignmentId: string,
): Promise<PlaybookSnapshot | null> {
  const { data } = await db
    .from("assignment_playbook_snapshots")
    .select("playbook_snapshot_json")
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  return (data?.playbook_snapshot_json as PlaybookSnapshot | undefined) ?? null;
}

/** What produced this deliverable, for the line on the review screen. */
export async function playbookUsedFor(
  db: Db,
  assignmentId: string,
): Promise<{ name: string; version: number; playbookId: string | null } | null> {
  const { data } = await db
    .from("assignment_playbook_snapshots")
    .select("playbook_id, playbook_name, playbook_version")
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  if (!data) return null;

  return {
    playbookId: (data.playbook_id as string | null) ?? null,
    name: data.playbook_name as string,
    version: data.playbook_version as number,
  };
}
