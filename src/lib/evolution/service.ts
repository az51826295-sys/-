import type { SupabaseClient } from "@supabase/supabase-js";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import type { Result } from "@/lib/assignments/service";
import { detectRoleGaps, roleForCapability, roleForSkill, type RoleGap } from "@/lib/evolution/gaps";
import { readCapacity } from "@/lib/planning/capacity";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export type ChangeType =
  | "hire_employee"
  | "create_department"
  | "split_department"
  | "merge_department"
  | "create_playbook"
  | "expand_role";

export type EvolutionStatus =
  | "draft"
  | "recommended"
  | "approved"
  | "implemented"
  | "cancelled";

export interface EvolutionChange {
  id: string;
  changeType: ChangeType;
  summary: string;
  reasoning: string;
  expectedEffect: string;
  orderIndex: number;
}

export interface RoadmapItem {
  id: string;
  orderIndex: number;
  roleName: string;
  employeeSlug: string | null;
  reason: string;
}

export interface EvolutionPlan {
  id: string;
  title: string;
  summary: string;
  status: EvolutionStatus;
  createdAt: string;
  changes: EvolutionChange[];
  roadmap: RoadmapItem[];
}

export interface StoredRoleGap extends RoleGap {
  id: string;
  status: string;
  lastSeenAt: string;
}

interface ProposedChange {
  changeType: ChangeType;
  summary: string;
  reasoning: string;
  expectedEffect: string;
  effect: Record<string, number | string>;
  gapSignalKey: string | null;
}

/**
 * How the company would have to change to stop hitting these gaps.
 *
 * Not a hiring list. A company that answers every gap by hiring ends up with
 * more people arranged the same badly-arranged way — the answer is sometimes a
 * department that does not exist, a method nobody wrote down, or widening what
 * somebody already here is allowed to do.
 *
 * Hiring stays last for the same reason as everywhere else: it is the only
 * change with a bill attached every month afterwards.
 */
function changesFor(
  gaps: RoleGap[],
  capacity: Awaited<ReturnType<typeof readCapacity>>,
  /** Skills that already have a published method, so the plan doesn't tell the
   *  manager to write one they finished last week. */
  documentedSkills: Set<string>,
): ProposedChange[] {
  const changes: ProposedChange[] = [];

  for (const gap of gaps) {
    if (gap.signalKey.startsWith("department_uncovered:")) {
      // The organisation says a department owns this and nobody there can do
      // it. Either somebody moves, or the ownership was wrong.
      changes.push({
        changeType: "expand_role",
        summary: `Move whoever can do ${gap.skillId ? gap.skillId.replace(/_/g, " ") : "this work"} into the department that owns it`,
        reasoning:
          "Nothing needs creating. Either somebody already here belongs in that department, or the department should not own this work — both are edits to the organisation rather than additions to it.",
        expectedEffect:
          "Work routed to that department would reach somebody instead of waiting indefinitely.",
        effect: { departmentId: gap.departmentId ?? "" },
        gapSignalKey: gap.signalKey,
      });
      continue;
    }

    if (gap.signalKey.startsWith("single_holder:")) {
      // Only where there is no method yet. Telling the manager to write down
      // something they published last week would make the whole page read as
      // boilerplate.
      if (gap.skillId && !documentedSkills.has(gap.skillId)) {
        changes.push({
          changeType: "create_playbook",
          summary: `Write down how ${gap.skillId.replace(/_/g, " ")} is done here`,
          reasoning:
            "The risk of one person holding a skill is mostly that the method leaves with them. Writing it down is free, and it is what makes a second person useful on their first day rather than their tenth.",
          expectedEffect:
            "The method survives the person, and anyone hired into it starts from what the company already knows.",
          effect: { skillId: gap.skillId },
          gapSignalKey: gap.signalKey,
        });
      }
    }
  }

  // A department worth creating: gaps clustered around work no existing
  // department owns. Only raised where there are several, because one gap does
  // not justify a new box on the org chart.
  const unowned = gaps.filter(
    (gap) => gap.departmentId === null && gap.signalKey.startsWith("capability_unmet:"),
  );

  if (unowned.length >= 2) {
    changes.push({
      changeType: "create_department",
      summary: "Consider a department for the work that keeps falling through",
      reasoning: `${unowned.length} different kinds of work have gone unanswered, and none of them belongs to any department you have. A department is where responsibility for a kind of work lives — without one, each of these stays nobody's job.`,
      expectedEffect: `${unowned.length} kinds of work would have somewhere to be routed.`,
      effect: { unmetKinds: unowned.length },
      gapSignalKey: null,
    });
  }

  // Hiring last, and only against gaps a defined role would actually close.
  for (const gap of gaps) {
    const role =
      roleForSkill(gap.skillId) ??
      (gap.signalKey.startsWith("capability_unmet:")
        ? roleForCapability(gap.signalKey.split(":")[1] ?? "")
        : null);

    if (!role) continue;
    if (gap.confidence === "low") continue;

    const department = capacity.departments.find(
      (row) => row.departmentId === gap.departmentId,
    );

    // "Hire Alex" reads as nonsense when Alex already works here. A gap that is
    // about one person carrying a skill alone is asking for a second person who
    // can do that work, so it is named by the role rather than by whoever
    // happens to hold it.
    const second = gap.signalKey.startsWith("single_holder:");

    changes.push({
      changeType: "hire_employee",
      summary: second
        ? `Hire a second ${role.role}`
        : `Hire ${role.name}, ${role.role}`,
      reasoning: second
        ? "A second person doing this work means it does not stop when the first is busy, and gives somebody to check the other's thinking. It is still the only change here that costs money every month."
        : "A role the product already defines, so they arrive with a skill and a method rather than as a job title. It is still the only change here that costs money every month.",
      expectedEffect: department
        ? `${department.name} would go from ${department.memberCount} to ${department.memberCount + 1}, with ${department.queueSize + department.forecastLoad} pieces of work spread across them instead of ${department.memberCount}.`
        : `Work of this kind would have somebody to go to. It has been needed ${gap.occurrences} ${gap.occurrences === 1 ? "time" : "times"}.`,
      effect: { slug: role.slug, occurrences: gap.occurrences },
      gapSignalKey: gap.signalKey,
    });
  }

  return changes;
}

const ORDER: Record<ChangeType, number> = {
  expand_role: 0,
  create_playbook: 1,
  merge_department: 2,
  split_department: 3,
  create_department: 4,
  hire_employee: 5,
};

/**
 * Looks at the gaps and writes down how the company would change.
 *
 * Free, like everything else in this layer. Written as one plan rather than one
 * per gap, because the ordering between them is the substance — "which of these
 * first" is the question a manager cannot answer from a list.
 */
export async function refreshEvolution(
  db: Db,
  companyId: string,
): Promise<{ gaps: number; hasPlan: boolean }> {
  const gaps = await detectRoleGaps(db, companyId);
  const capacity = await readCapacity(db, companyId);
  const now = new Date().toISOString();

  for (const gap of gaps) {
    const { data: existing } = await db
      .from("role_gaps")
      .select("id, first_seen_at")
      .eq("company_id", companyId)
      .eq("signal_key", gap.signalKey)
      .maybeSingle();

    await db.from("role_gaps").upsert(
      {
        company_id: companyId,
        title: gap.title,
        reason: gap.reason,
        skill_id: gap.skillId,
        department_id: gap.departmentId,
        occurrences: gap.occurrences,
        confidence: gap.confidence,
        signal_key: gap.signalKey,
        // Kept from the first sighting: how long a gap has been open is most of
        // what makes it worth acting on.
        first_seen_at: (existing?.first_seen_at as string | undefined) ?? now,
        last_seen_at: now,
      },
      { onConflict: "company_id,signal_key" },
    );
  }

  const liveKeys = new Set(gaps.map((gap) => gap.signalKey));
  const { data: stored } = await db
    .from("role_gaps")
    .select("id, signal_key, status")
    .eq("company_id", companyId)
    .eq("status", "open");

  const closed = ((stored ?? []) as { id: string; signal_key: string }[]).filter(
    (row) => !liveKeys.has(row.signal_key),
  );

  if (closed.length > 0) {
    await db
      .from("role_gaps")
      .update({ status: "closed" })
      .in(
        "id",
        closed.map((row) => row.id),
      );
  }

  const { data: publishedPlaybooks } = await db
    .from("playbooks")
    .select("skill_id")
    .eq("company_id", companyId)
    .eq("status", "active")
    .not("skill_id", "is", null);

  const documentedSkills = new Set(
    ((publishedPlaybooks ?? []) as { skill_id: string }[]).map((row) => row.skill_id),
  );

  // A gap the manager said isn't one stops producing proposals. Detection is
  // stateless by design — it re-reads the evidence every time — so without this
  // the page would keep re-raising something they have already answered, and
  // "not a gap" would be a button that does nothing.
  const { data: dismissedRows } = await db
    .from("role_gaps")
    .select("signal_key")
    .eq("company_id", companyId)
    .eq("status", "dismissed");

  const dismissed = new Set(
    ((dismissedRows ?? []) as { signal_key: string }[]).map((row) => row.signal_key),
  );

  const live = gaps.filter((gap) => !dismissed.has(gap.signalKey));

  const changes = changesFor(live, capacity, documentedSkills).sort(
    (a, b) => ORDER[a.changeType] - ORDER[b.changeType],
  );

  if (changes.length === 0) {
    // Nothing to propose. Any open plan is removed rather than left describing
    // a company that has since changed shape.
    await db
      .from("workforce_evolution_plans")
      .delete()
      .eq("company_id", companyId)
      .eq("status", "recommended");

    return { gaps: gaps.length, hasPlan: false };
  }

  const { data: prior } = await db
    .from("workforce_evolution_plans")
    .select("id, status")
    .eq("company_id", companyId)
    .eq("signal_key", "organization_evolution")
    .maybeSingle();

  // A plan the manager decided on stays as they left it.
  if (prior && prior.status !== "recommended") {
    return { gaps: gaps.length, hasPlan: true };
  }

  const { data: plan } = await db
    .from("workforce_evolution_plans")
    .upsert(
      {
        company_id: companyId,
        title: "How the organisation would need to change",
        summary: `${gaps.length} ${gaps.length === 1 ? "gap" : "gaps"} between the work this company keeps needing and the people it has. These are the changes that would close them, cheapest first.`,
        situation_json: { capturedAt: now, gaps: gaps.map((gap) => gap.title) },
        status: "recommended",
        signal_key: "organization_evolution",
        updated_at: now,
      },
      { onConflict: "company_id,signal_key" },
    )
    .select("id")
    .maybeSingle();

  if (!plan) return { gaps: gaps.length, hasPlan: false };

  const planId = plan.id as string;

  const { data: gapRows } = await db
    .from("role_gaps")
    .select("id, signal_key")
    .eq("company_id", companyId);

  const gapIdByKey = new Map(
    ((gapRows ?? []) as { id: string; signal_key: string }[]).map((row) => [
      row.signal_key,
      row.id,
    ]),
  );

  // Upserted rather than cleared and re-inserted. Two refreshes overlapping —
  // a page render and a client fetch, which is the normal case — would leave
  // the plan showing the same change twice.
  await db.from("evolution_changes").upsert(
    changes.map((change, index) => ({
      company_id: companyId,
      plan_id: planId,
      role_gap_id: change.gapSignalKey
        ? (gapIdByKey.get(change.gapSignalKey) ?? null)
        : null,
      change_type: change.changeType,
      summary: change.summary,
      reasoning: change.reasoning,
      expected_effect: change.expectedEffect,
      effect_json: change.effect,
      order_index: index,
    })),
    { onConflict: "plan_id,change_type,summary" },
  );

  // Anything the plan no longer proposes is dropped, so a change that stopped
  // making sense does not linger next to the ones that still do.
  const liveSummaries = changes.map((change) => change.summary);
  if (liveSummaries.length > 0) {
    await db
      .from("evolution_changes")
      .delete()
      .eq("plan_id", planId)
      .not("summary", "in", `(${liveSummaries.map((s) => `"${s.replace(/"/g, '""')}"`).join(",")})`);
  }

  // The hiring roadmap is the same hires, pulled out and ordered by how often
  // the gap was actually hit. A manager deciding what this quarter looks like
  // reads this and nothing else.
  const hires = changes
    .filter((change) => change.changeType === "hire_employee")
    .sort(
      (a, b) =>
        Number(b.effect.occurrences ?? 0) - Number(a.effect.occurrences ?? 0),
    );

  await db.from("hiring_roadmap_items").delete().eq("plan_id", planId);

  if (hires.length > 0) {
    await db.from("hiring_roadmap_items").upsert(
      hires.map((hire, index) => ({
        company_id: companyId,
        plan_id: planId,
        role_gap_id: hire.gapSignalKey
          ? (gapIdByKey.get(hire.gapSignalKey) ?? null)
          : null,
        order_index: index,
        role_name: hire.summary.replace(/^Hire /, ""),
        employee_slug: String(hire.effect.slug ?? "") || null,
        reason: hire.expectedEffect,
      })),
      { onConflict: "plan_id,role_name" },
    );
  }

  return { gaps: gaps.length, hasPlan: true };
}

// --- Reading -------------------------------------------------------------

export async function loadRoleGaps(
  db: Db,
  companyId: string,
): Promise<StoredRoleGap[]> {
  const { data } = await db
    .from("role_gaps")
    .select("*")
    .eq("company_id", companyId)
    .order("last_seen_at", { ascending: false });

  return ((data ?? []) as {
    id: string;
    title: string;
    reason: string;
    skill_id: string | null;
    department_id: string | null;
    occurrences: number;
    confidence: string;
    status: string;
    signal_key: string;
    last_seen_at: string;
  }[]).map((row) => ({
    id: row.id,
    title: row.title,
    reason: row.reason,
    skillId: row.skill_id,
    departmentId: row.department_id,
    occurrences: row.occurrences,
    confidence: row.confidence as RoleGap["confidence"],
    status: row.status,
    signalKey: row.signal_key,
    lastSeenAt: row.last_seen_at,
  }));
}

export async function loadEvolution(): Promise<{
  gaps: StoredRoleGap[];
  plan: EvolutionPlan | null;
} | null> {
  const context = await getCompanyContext();
  if (!context) return null;

  const { supabase, companyId } = context;
  await refreshEvolution(supabase, companyId);

  const { data } = await supabase
    .from("workforce_evolution_plans")
    .select("*, evolution_changes(*), hiring_roadmap_items(*)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as unknown as {
    id: string;
    title: string;
    summary: string;
    status: string;
    created_at: string;
    evolution_changes: {
      id: string;
      change_type: string;
      summary: string;
      reasoning: string;
      expected_effect: string;
      order_index: number;
    }[] | null;
    hiring_roadmap_items: {
      id: string;
      order_index: number;
      role_name: string;
      employee_slug: string | null;
      reason: string;
    }[] | null;
  } | null;

  return {
    gaps: (await loadRoleGaps(supabase, companyId)).filter(
      (gap) => gap.status === "open",
    ),
    plan: row
      ? {
          id: row.id,
          title: row.title,
          summary: row.summary,
          status: row.status as EvolutionStatus,
          createdAt: row.created_at,
          changes: (row.evolution_changes ?? [])
            .map((change) => ({
              id: change.id,
              changeType: change.change_type as ChangeType,
              summary: change.summary,
              reasoning: change.reasoning,
              expectedEffect: change.expected_effect,
              orderIndex: change.order_index,
            }))
            .sort((a, b) => a.orderIndex - b.orderIndex),
          roadmap: (row.hiring_roadmap_items ?? [])
            .map((item) => ({
              id: item.id,
              orderIndex: item.order_index,
              roleName: item.role_name,
              employeeSlug: item.employee_slug,
              reason: item.reason,
            }))
            .sort((a, b) => a.orderIndex - b.orderIndex),
        }
      : null,
  };
}

/** The numbers on the dashboard card. */
export async function loadEvolutionSummary(
  db: Db,
  companyId: string,
): Promise<{ openGaps: number; recommendedHires: number }> {
  const { count: gaps } = await db
    .from("role_gaps")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "open");

  const { count: hires } = await db
    .from("hiring_roadmap_items")
    .select("id, workforce_evolution_plans!inner(status)", {
      count: "exact",
      head: true,
    })
    .eq("company_id", companyId)
    .eq("workforce_evolution_plans.status", "recommended");

  return { openGaps: gaps ?? 0, recommendedHires: hires ?? 0 };
}

// --- Deciding ------------------------------------------------------------

/**
 * Accepts the shape of the company changing.
 *
 * Records the decision and nothing else. No department is created, nobody is
 * hired — a system that reorganised the company on its own recommendation
 * would be making the one kind of decision a manager most needs to make
 * themselves.
 */
export async function decideEvolutionPlan(
  planId: string,
  decision: "approved" | "cancelled",
): Promise<Result<{ ok: true }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Plan not found.", status: 404 };

  const now = new Date().toISOString();

  const { data } = await context.supabase
    .from("workforce_evolution_plans")
    .update({ status: decision, decided_at: now, updated_at: now })
    .eq("id", planId)
    .eq("company_id", context.companyId)
    .eq("status", "recommended")
    .select("id")
    .maybeSingle();

  if (!data) return { error: "Plan not found.", status: 404 };

  return { ok: true };
}

export async function dismissRoleGap(gapId: string): Promise<Result<{ ok: true }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Not found.", status: 404 };

  const { data } = await context.supabase
    .from("role_gaps")
    .update({ status: "dismissed" })
    .eq("id", gapId)
    .eq("company_id", context.companyId)
    .select("id")
    .maybeSingle();

  if (!data) return { error: "Not found.", status: 404 };

  return { ok: true };
}
