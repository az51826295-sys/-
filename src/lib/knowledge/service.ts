import type { SupabaseClient } from "@supabase/supabase-js";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import type { Result } from "@/lib/assignments/service";
import {
  KNOWLEDGE_SUMMARY_HARD_MAX,
  KNOWLEDGE_TITLE_HARD_MAX,
  type CandidateStatus,
  type KnowledgeCategory,
  type KnowledgeStatus,
} from "@/lib/knowledge/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export interface LearningCandidateRow {
  id: string;
  title: string;
  summary: string;
  reason: string;
  category: KnowledgeCategory;
  confidence: string;
  status: CandidateStatus;
  managerNote: string;
  createdAt: string;
  deliverableId: string | null;
  deliverableTitle: string | null;
  employeeName: string | null;
}

export interface KnowledgeRow {
  id: string;
  title: string;
  description: string;
  category: KnowledgeCategory;
  status: KnowledgeStatus;
  createdAt: string;
  sourceCount: number;
}

// --- Reading -------------------------------------------------------------

export async function loadCandidates(
  db: Db,
  companyId: string,
  status?: CandidateStatus,
): Promise<LearningCandidateRow[]> {
  let query = db
    .from("learning_candidates")
    .select(
      "*, deliverables(title), company_employees!learning_candidates_company_employee_id_fkey(employees(name))",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data } = await query;

  return ((data ?? []) as unknown as {
    id: string;
    title: string;
    summary: string;
    reason: string;
    category: string;
    confidence: string;
    status: string;
    manager_note: string;
    created_at: string;
    deliverable_id: string | null;
    deliverables: { title: string } | null;
    company_employees: { employees: { name: string } | null } | null;
  }[]).map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    reason: row.reason,
    category: row.category as KnowledgeCategory,
    confidence: row.confidence,
    status: row.status as CandidateStatus,
    managerNote: row.manager_note,
    createdAt: row.created_at,
    deliverableId: row.deliverable_id,
    deliverableTitle: row.deliverables?.title ?? null,
    employeeName: row.company_employees?.employees?.name ?? null,
  }));
}

export async function loadKnowledge(
  db: Db,
  companyId: string,
): Promise<KnowledgeRow[]> {
  const { data } = await db
    .from("organization_knowledge")
    .select("*, knowledge_sources(id)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as {
    id: string;
    title: string;
    description: string;
    category: string;
    status: string;
    created_at: string;
    knowledge_sources: { id: string }[] | null;
  }[]).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as KnowledgeCategory,
    status: row.status as KnowledgeStatus,
    createdAt: row.created_at,
    sourceCount: row.knowledge_sources?.length ?? 0,
  }));
}

/** The numbers on the dashboard card. */
export async function loadLearningSummary(
  db: Db,
  companyId: string,
): Promise<{ pending: number; adopted: number; playbookDrafts: number }> {
  const [pending, adopted, drafts] = await Promise.all([
    db
      .from("learning_candidates")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "pending"),
    db
      .from("organization_knowledge")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "active"),
    db
      .from("playbook_improvement_drafts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "proposed"),
  ]);

  return {
    pending: pending.count ?? 0,
    adopted: adopted.count ?? 0,
    playbookDrafts: drafts.count ?? 0,
  };
}

export async function loadPlaybookDrafts(
  db: Db,
  companyId: string,
): Promise<
  {
    id: string;
    playbookId: string;
    playbookName: string;
    changeSummary: string;
    proposedStepInstruction: string;
    targetStageTitle: string;
    status: string;
  }[]
> {
  const { data } = await db
    .from("playbook_improvement_drafts")
    .select("*, playbooks(name)")
    .eq("company_id", companyId)
    .eq("status", "proposed")
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as {
    id: string;
    playbook_id: string;
    change_summary: string;
    proposed_step_instruction: string;
    target_stage_title: string;
    status: string;
    playbooks: { name: string } | null;
  }[]).map((row) => ({
    id: row.id,
    playbookId: row.playbook_id,
    playbookName: row.playbooks?.name ?? "A playbook",
    changeSummary: row.change_summary,
    proposedStepInstruction: row.proposed_step_instruction,
    targetStageTitle: row.target_stage_title,
    status: row.status,
  }));
}

// --- Deciding ------------------------------------------------------------

/**
 * Adopts a proposal as something the company knows.
 *
 * This is the moment one employee's afternoon becomes everybody's standing
 * instruction, so it is a manager's click and nothing else. The sources are
 * recorded with it: "the company believes this" should always be answerable
 * with "because of this work, approved on this date".
 */
export async function approveCandidate(
  candidateId: string,
): Promise<Result<{ knowledgeId: string; playbookDraftId: string | null }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Proposal not found.", status: 404 };

  const { supabase, companyId } = context;

  const { data: candidate } = await supabase
    .from("learning_candidates")
    .select("*")
    .eq("id", candidateId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!candidate) return { error: "Proposal not found.", status: 404 };

  if (candidate.status !== "pending" && candidate.status !== "needs_revision") {
    return { error: "You've already decided on this one.", status: 409 };
  }

  const title = String(candidate.title ?? "").slice(0, KNOWLEDGE_TITLE_HARD_MAX);
  const description = String(candidate.summary ?? "").slice(
    0,
    KNOWLEDGE_SUMMARY_HARD_MAX,
  );

  const { data: created, error } = await supabase
    .from("organization_knowledge")
    .insert({
      company_id: companyId,
      title,
      description,
      category: candidate.category,
      status: "active",
      learning_candidate_id: candidateId,
    })
    .select("id")
    .single();

  if (error || !created) {
    if (error?.code === "23505") {
      return {
        error: "The company already knows something under that name.",
        status: 409,
      };
    }
    return { error: "I couldn't adopt this.", status: 500 };
  }

  const knowledgeId = created.id as string;

  // The work this rests on. Written after the knowledge so a failure here
  // leaves knowledge without a source rather than losing the decision — and the
  // source list is visibly empty, which is honest.
  if (candidate.deliverable_id) {
    const { data: review } = await supabase
      .from("deliverable_reviews")
      .select("id")
      .eq("deliverable_id", candidate.deliverable_id)
      .eq("decision", "approved")
      .maybeSingle();

    await supabase.from("knowledge_sources").insert({
      company_id: companyId,
      knowledge_id: knowledgeId,
      deliverable_id: candidate.deliverable_id,
      review_id: (review?.id as string | undefined) ?? null,
    });
  }

  const now = new Date().toISOString();

  await supabase
    .from("learning_candidates")
    .update({ status: "approved", decided_at: now, updated_at: now })
    .eq("id", candidateId);

  const playbookDraftId = await proposePlaybookChange(
    supabase,
    companyId,
    knowledgeId,
    candidate,
  );

  return { knowledgeId, playbookDraftId };
}

/**
 * Where adopted knowledge bears on a method, writes down what would change.
 *
 * A draft, never an edit. Deliberately narrow: only proposals about how work is
 * done get this far, because a research finding about the market is something
 * to know, not a step to add — and a method that grew a step every time
 * somebody learned something would be unreadable within a month.
 */
async function proposePlaybookChange(
  db: Db,
  companyId: string,
  knowledgeId: string,
  candidate: Record<string, unknown>,
): Promise<string | null> {
  const category = candidate.category as KnowledgeCategory;
  if (category !== "process_improvement" && category !== "quality_improvement") {
    return null;
  }

  // The method belonging to whoever did the work that produced this.
  const employeeId = candidate.company_employee_id as string | null;
  if (!employeeId) return null;

  const { data: membership } = await db
    .from("department_members")
    .select("department_id")
    .eq("company_employee_id", employeeId)
    .maybeSingle();

  const departmentId = membership?.department_id as string | undefined;
  if (!departmentId) return null;

  const { data: playbook } = await db
    .from("playbooks")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("department_id", departmentId)
    .eq("status", "active")
    .maybeSingle();

  if (!playbook) return null;

  const { data: created } = await db
    .from("playbook_improvement_drafts")
    .insert({
      company_id: companyId,
      playbook_id: playbook.id as string,
      knowledge_id: knowledgeId,
      change_summary: `Adopted "${candidate.title as string}" — worth building into how ${playbook.name as string} is done.`,
      proposed_step_instruction: candidate.summary as string,
      proposed_step_expected_output: "",
      target_stage_title: "",
      status: "proposed",
    })
    .select("id")
    .maybeSingle();

  return (created?.id as string | undefined) ?? null;
}

export async function decideCandidate(
  candidateId: string,
  decision: "rejected" | "needs_revision",
  note: string,
): Promise<Result<{ ok: true }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Proposal not found.", status: 404 };

  const { supabase, companyId } = context;

  const { data: candidate } = await supabase
    .from("learning_candidates")
    .select("id, status")
    .eq("id", candidateId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!candidate) return { error: "Proposal not found.", status: 404 };

  if (candidate.status === "approved") {
    return {
      error: "This one has already been adopted. Retire it from what the company knows instead.",
      status: 409,
    };
  }

  const now = new Date().toISOString();

  await supabase
    .from("learning_candidates")
    .update({
      status: decision,
      manager_note: note.trim().slice(0, 500),
      decided_at: now,
      updated_at: now,
    })
    .eq("id", candidateId);

  return { ok: true };
}

/** Retiring something the company no longer believes. Kept rather than deleted:
 *  work done under it should stay explicable. */
export async function retireKnowledge(
  knowledgeId: string,
): Promise<Result<{ ok: true }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Not found.", status: 404 };

  const { data } = await context.supabase
    .from("organization_knowledge")
    .update({ status: "deprecated", updated_at: new Date().toISOString() })
    .eq("id", knowledgeId)
    .eq("company_id", context.companyId)
    .select("id")
    .maybeSingle();

  if (!data) return { error: "Not found.", status: 404 };

  return { ok: true };
}

/**
 * Turns an accepted proposal into an actual step in the method.
 *
 * Adds it to the playbook as an unpublished change. The manager still has to
 * publish, which is the same gate every other change to a method passes
 * through — learning does not get a shortcut around it.
 */
export async function applyPlaybookDraft(
  draftId: string,
): Promise<Result<{ playbookId: string }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Proposal not found.", status: 404 };

  const { supabase, companyId } = context;

  const { data: draft } = await supabase
    .from("playbook_improvement_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!draft) return { error: "Proposal not found.", status: 404 };
  if (draft.status !== "proposed") {
    return { error: "You've already decided on this one.", status: 409 };
  }

  const playbookId = draft.playbook_id as string;

  // The last stage, because a lesson drawn from finished work is almost always
  // about what the finished work should contain rather than how it starts.
  const { data: stages } = await supabase
    .from("playbook_stages")
    .select("id, title, order_index")
    .eq("playbook_id", playbookId)
    .order("order_index", { ascending: false })
    .limit(1);

  const stage = (stages ?? [])[0] as { id: string } | undefined;
  if (!stage) {
    return {
      error: "That playbook has no stages to add this to.",
      status: 409,
    };
  }

  const { count } = await supabase
    .from("playbook_steps")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", stage.id);

  await supabase.from("playbook_steps").insert({
    company_id: companyId,
    stage_id: stage.id,
    instruction: draft.proposed_step_instruction as string,
    expected_output: (draft.proposed_step_expected_output as string) ?? "",
    required: true,
    order_index: count ?? 0,
  });

  await supabase
    .from("playbook_improvement_drafts")
    .update({ status: "applied", applied_at: new Date().toISOString() })
    .eq("id", draftId);

  return { playbookId };
}

export async function dismissPlaybookDraft(
  draftId: string,
): Promise<Result<{ ok: true }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Proposal not found.", status: 404 };

  const { data } = await context.supabase
    .from("playbook_improvement_drafts")
    .update({ status: "dismissed" })
    .eq("id", draftId)
    .eq("company_id", context.companyId)
    .eq("status", "proposed")
    .select("id")
    .maybeSingle();

  if (!data) return { error: "Proposal not found.", status: 404 };

  return { ok: true };
}
