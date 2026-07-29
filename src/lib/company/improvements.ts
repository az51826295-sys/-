import type { SupabaseClient } from "@supabase/supabase-js";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import type { Result } from "@/lib/assignments/service";
import { readCapacity } from "@/lib/planning/capacity";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export type ImprovementSource =
  | "learning_candidate"
  | "playbook_draft"
  | "workforce_recommendation"
  | "workforce_plan"
  | "evolution_plan";

export type ImprovementStatus =
  | "detected"
  | "proposed"
  | "approved"
  | "implemented"
  | "measured"
  | "completed"
  | "dismissed";

export interface Improvement {
  id: string;
  category: string;
  title: string;
  detail: string;
  source: ImprovementSource;
  sourceId: string;
  priority: number;
  status: ImprovementStatus;
  /** Where the manager goes to actually decide on it. */
  href: string;
}

const HREF: Record<ImprovementSource, string> = {
  learning_candidate: "/dashboard/learning",
  playbook_draft: "/dashboard/learning",
  workforce_recommendation: "/dashboard/intelligence",
  workforce_plan: "/dashboard/planning",
  evolution_plan: "/dashboard/evolution",
};

/**
 * Everything outstanding, from wherever it came from.
 *
 * An index, not a fifth opinion. Learning, the diagnosis, planning and
 * evolution each raise proposals with evidence behind them; this collects them
 * so the manager has one queue instead of four pages to remember. Deciding
 * still happens where the proposal lives, because that is where the evidence
 * is — this only tells them it exists.
 *
 * Free, like everything in this layer.
 */
export async function refreshImprovements(
  db: Db,
  companyId: string,
): Promise<number> {
  const found: Omit<Improvement, "id" | "href">[] = [];

  const [candidates, drafts, recommendations, plans, evolution] = await Promise.all([
    db
      .from("learning_candidates")
      .select("id, title, summary, category")
      .eq("company_id", companyId)
      .eq("status", "pending"),
    db
      .from("playbook_improvement_drafts")
      .select("id, change_summary, playbooks(name)")
      .eq("company_id", companyId)
      .eq("status", "proposed"),
    db
      .from("workforce_recommendations")
      .select("id, title, description, category, priority")
      .eq("company_id", companyId)
      .eq("status", "new"),
    db
      .from("workforce_plans")
      .select("id, title, summary")
      .eq("company_id", companyId)
      .eq("status", "recommended"),
    db
      .from("workforce_evolution_plans")
      .select("id, title, summary")
      .eq("company_id", companyId)
      .eq("status", "recommended"),
  ]);

  for (const row of (candidates.data ?? []) as {
    id: string;
    title: string;
    summary: string;
  }[]) {
    found.push({
      category: "learning",
      title: row.title,
      detail: row.summary,
      source: "learning_candidate",
      sourceId: row.id,
      priority: 20,
      status: "proposed",
    });
  }

  for (const row of (drafts.data ?? []) as unknown as {
    id: string;
    change_summary: string;
    playbooks: { name: string } | null;
  }[]) {
    found.push({
      category: "method",
      title: `Change to ${row.playbooks?.name ?? "a playbook"}`,
      detail: row.change_summary,
      source: "playbook_draft",
      sourceId: row.id,
      priority: 30,
      status: "proposed",
    });
  }

  for (const row of (recommendations.data ?? []) as {
    id: string;
    title: string;
    description: string;
    category: string;
    priority: number;
  }[]) {
    found.push({
      category: row.category === "hiring" ? "organisation" : "capacity",
      title: row.title,
      detail: row.description,
      source: "workforce_recommendation",
      sourceId: row.id,
      // Carried through rather than reassigned: the diagnosis already worked
      // out that clearing a review queue beats hiring, and re-ranking here
      // would quietly lose that.
      priority: row.priority,
      status: "proposed",
    });
  }

  for (const row of (plans.data ?? []) as {
    id: string;
    title: string;
    summary: string;
  }[]) {
    found.push({
      category: "capacity",
      title: row.title,
      detail: row.summary,
      source: "workforce_plan",
      sourceId: row.id,
      priority: 40,
      status: "proposed",
    });
  }

  for (const row of (evolution.data ?? []) as {
    id: string;
    title: string;
    summary: string;
  }[]) {
    found.push({
      category: "organisation",
      title: row.title,
      detail: row.summary,
      source: "evolution_plan",
      sourceId: row.id,
      priority: 60,
      status: "proposed",
    });
  }

  const now = new Date().toISOString();

  for (const item of found) {
    // Status is left out of the update on purpose: a manager who marked an
    // item done should not have it reopened because the source still lists it.
    await db.from("improvement_opportunities").upsert(
      {
        company_id: companyId,
        category: item.category,
        title: item.title,
        detail: item.detail,
        source: item.source,
        source_id: item.sourceId,
        priority: item.priority,
        updated_at: now,
      },
      { onConflict: "company_id,source,source_id", ignoreDuplicates: false },
    );
  }

  // An item whose source has been decided elsewhere leaves the backlog. The
  // manager approving a recommendation on the intelligence page should not
  // find it still waiting here.
  const liveIds = new Set(found.map((item) => `${item.source}:${item.sourceId}`));

  const { data: stored } = await db
    .from("improvement_opportunities")
    .select("id, source, source_id, status")
    .eq("company_id", companyId)
    .in("status", ["detected", "proposed"]);

  const gone = ((stored ?? []) as {
    id: string;
    source: string;
    source_id: string;
  }[]).filter((row) => !liveIds.has(`${row.source}:${row.source_id}`));

  if (gone.length > 0) {
    await db
      .from("improvement_opportunities")
      .delete()
      .in(
        "id",
        gone.map((row) => row.id),
      );
  }

  return found.length;
}

export async function loadImprovements(
  db: Db,
  companyId: string,
): Promise<Improvement[]> {
  const { data } = await db
    .from("improvement_opportunities")
    .select("*")
    .eq("company_id", companyId)
    .order("priority", { ascending: true });

  return ((data ?? []) as {
    id: string;
    category: string;
    title: string;
    detail: string;
    source: string;
    source_id: string;
    priority: number;
    status: string;
  }[]).map((row) => ({
    id: row.id,
    category: row.category,
    title: row.title,
    detail: row.detail,
    source: row.source as ImprovementSource,
    sourceId: row.source_id,
    priority: row.priority,
    status: row.status as ImprovementStatus,
    href: HREF[row.source as ImprovementSource] ?? "/dashboard",
  }));
}

/**
 * Takes the reading a change is meant to improve, at the moment it is accepted.
 *
 * Captured now rather than reconstructed later. By the time anyone asks whether
 * something helped, the state it was meant to fix has already moved, and
 * working out what it used to be would be guessing dressed as measurement.
 */
export async function captureBefore(
  improvementId: string,
): Promise<Result<{ captured: number }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Not found.", status: 404 };

  const { supabase, companyId } = context;

  const { data: improvement } = await supabase
    .from("improvement_opportunities")
    .select("id, category")
    .eq("id", improvementId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!improvement) return { error: "Not found.", status: 404 };

  const reading = await readCapacity(supabase, companyId);
  const now = new Date().toISOString();

  const rows = reading.departments.map((department) => ({
    company_id: companyId,
    improvement_id: improvementId,
    metric: "capacity_used",
    subject: department.name,
    before_value: department.capacityUsed,
    captured_at: now,
  }));

  if (rows.length > 0) await supabase.from("change_impacts").insert(rows);

  await supabase
    .from("improvement_opportunities")
    .update({ status: "approved", updated_at: now })
    .eq("id", improvementId);

  return { captured: rows.length };
}

export interface MeasuredImpact {
  metric: string;
  subject: string;
  before: number;
  after: number | null;
  capturedAt: string;
}

/**
 * Compares the reading taken at approval with the company as it stands.
 *
 * Reports the numbers and stops. Whether a change "worked" depends on what else
 * happened that week, and a system that scored its own suggestions would be
 * marking its own homework.
 */
export async function measureImpacts(
  db: Db,
  companyId: string,
): Promise<MeasuredImpact[]> {
  const { data } = await db
    .from("change_impacts")
    .select("id, metric, subject, before_value, after_value, captured_at")
    .eq("company_id", companyId)
    .order("captured_at", { ascending: false })
    .limit(20);

  const rows = (data ?? []) as {
    id: string;
    metric: string;
    subject: string;
    before_value: number;
    after_value: number | null;
    captured_at: string;
  }[];

  if (rows.length === 0) return [];

  const reading = await readCapacity(db, companyId);
  const now = new Date().toISOString();

  const measured: MeasuredImpact[] = [];

  for (const row of rows) {
    const department = reading.departments.find(
      (entry) => entry.name === row.subject,
    );
    const after = department ? department.capacityUsed : null;

    if (after !== null && row.after_value === null) {
      await db
        .from("change_impacts")
        .update({ after_value: after, measured_at: now })
        .eq("id", row.id);
    }

    measured.push({
      metric: row.metric,
      subject: row.subject,
      before: Number(row.before_value),
      after: row.after_value === null ? after : Number(row.after_value),
      capturedAt: row.captured_at,
    });
  }

  return measured;
}
