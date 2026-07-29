import { createClient } from "@/lib/supabase/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import type { Result } from "@/lib/assignments/service";
import { defaultProviders, type Providers } from "@/lib/execution/shared";
import { meterProviders } from "@/lib/costs/meter";
import { ensureOrganization, loadOrganization } from "@/lib/departments/service";
import { createProject } from "@/lib/projects/service";
import { resolvePolicies } from "@/lib/policies/resolve";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import {
  buildOperatingPlanPrompt,
  buildOperatingReviewPrompt,
  type CompanyContext,
} from "@/lib/operations/prompts";
import {
  CYCLE_NAME_MAX,
  MAX_PHASES,
  MAX_RECOMMENDATIONS,
  OBJECTIVE_MAX,
  OBJECTIVE_MIN,
  operatingPlanSchema,
  operatingReviewSchema,
  type CycleStatus,
  type Recommendation,
  type ReviewStatus,
} from "@/lib/operations/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

export interface CycleRow {
  id: string;
  company_id: string;
  name: string;
  objective: string;
  status: CycleStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

const OPEN: CycleStatus[] = ["planning", "active", "review"];

/**
 * Starts a period of operation.
 *
 * One at a time, enforced by the database rather than checked here as well: a
 * company working in two directions has two answers to "what are we doing", and
 * every recommendation would have to guess which one it belonged to.
 */
export async function createCycle(input: {
  name: string;
  objective: string;
}): Promise<Result<{ cycleId: string }>> {
  const company = await getCompanyContext();
  if (!company) return { error: "Company not found.", status: 404 };

  const name = input.name?.trim() ?? "";
  const objective = input.objective?.trim() ?? "";

  if (!name) return { error: "Give this period a name.", status: 400 };
  if (name.length > CYCLE_NAME_MAX) {
    return { error: `Keep the name under ${CYCLE_NAME_MAX} characters.`, status: 400 };
  }
  if (objective.length < OBJECTIVE_MIN) {
    return {
      error: `Describe the objective in at least ${OBJECTIVE_MIN} characters.`,
      status: 400,
    };
  }
  if (objective.length > OBJECTIVE_MAX) {
    return { error: `Keep the objective under ${OBJECTIVE_MAX} characters.`, status: 400 };
  }

  await ensureOrganization(company.supabase as Db, company.companyId);
  const organization = await loadOrganization(company.supabase as Db, company.companyId);

  if (organization.length === 0) {
    return {
      error: "Hire and train at least one employee before starting an operation.",
      status: 409,
    };
  }

  const {
    data: { user },
  } = await company.supabase.auth.getUser();

  const { data: created, error } = await company.supabase
    .from("operating_cycles")
    .insert({
      company_id: company.companyId,
      name,
      objective,
      status: "planning",
      created_by_user_id: user?.id ?? null,
    })
    .select("id")
    .maybeSingle();

  // The partial unique index is what rejects a second open cycle; catching it
  // here turns a database error into something the manager can act on.
  if (error || !created) {
    return {
      error: "Your company is already working through an operation.",
      status: 409,
    };
  }

  return { cycleId: created.id as string };
}

export interface OwnedCycle {
  supabase: Awaited<ReturnType<typeof createClient>>;
  cycle: CycleRow;
}

/** Row level security scopes cycles by owner, so another company's id simply
 *  misses and callers answer 404. */
export async function getOwnedCycle(cycleId: string): Promise<OwnedCycle | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("operating_cycles")
    .select("*")
    .eq("id", cycleId)
    .maybeSingle<CycleRow>();

  if (!data) return null;
  return { supabase, cycle: data };
}

export async function getCurrentCycle(): Promise<CycleRow | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("operating_cycles")
    .select("*")
    .in("status", OPEN)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<CycleRow>();

  return data ?? null;
}

async function companyContextFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
): Promise<CompanyContext> {
  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();

  const { data: knowledge } = await supabase
    .from("employee_knowledge_profiles")
    .select(
      "company_summary, customer_summary, problem_summary, company_employees!inner(company_id)",
    )
    .eq("company_employees.company_id", companyId)
    .limit(1)
    .maybeSingle();

  return {
    name: (company?.name as string) ?? "the company",
    summary: (knowledge?.company_summary as string) ?? "",
    customers: (knowledge?.customer_summary as string) ?? "",
    problem: (knowledge?.problem_summary as string) ?? "",
  };
}

/**
 * Works out how the period breaks down.
 *
 * Planned against the departments that exist, not an idealised org chart —
 * a plan naming a department the company does not have is a plan nobody can
 * carry out.
 */
export async function prepareOperatingPlan(
  cycleId: string,
  providers: Providers = defaultProviders(),
): Promise<Result<{ status: string }>> {
  const owned = await getOwnedCycle(cycleId);
  if (!owned) return { error: "Operation not found.", status: 404 };

  const { supabase, cycle } = owned;

  if (!["planning", "active"].includes(cycle.status)) {
    return { error: "This operation has already finished.", status: 409 };
  }

  const blocked = await blockedBySpendLimit(supabase as Db, cycle.company_id);
  if (blocked) return { error: blocked, status: 402 };

  await ensureOrganization(supabase as Db, cycle.company_id);
  const organization = await loadOrganization(supabase as Db, cycle.company_id);

  if (organization.length === 0) {
    return { error: "Nobody is available to work on this.", status: 409 };
  }

  const company = await companyContextFor(supabase, cycle.company_id);
  const { system, input } = buildOperatingPlanPrompt(
    cycle.name,
    cycle.objective,
    company,
    organization,
    // The whole company's standards: a period of operation spans every
    // department, so nobody's departmental scope applies to all of it.
    await resolvePolicies(supabase as Db, cycle.company_id, null),
  );

  const metered = meterProviders(providers, supabase as Db, {
    companyId: cycle.company_id,
  });

  let plan;
  try {
    const result = await metered.ai.generateStructuredOutput({
      systemInstructions: system,
      input,
      schema: operatingPlanSchema,
      schemaName: "operating_plan",
      maxTokens: 16000,
    });
    plan = result.output;
  } catch {
    return { error: "The operating plan couldn't be prepared.", status: 502 };
  }

  if (plan.cannotPlan) {
    return {
      error:
        plan.cannotPlanReason.trim() ||
        "This objective needs skills nobody here has yet.",
      status: 422,
    };
  }

  const now = new Date().toISOString();

  const { data: previous } = await supabase
    .from("operating_plans")
    .select("id, version")
    .eq("operating_cycle_id", cycleId)
    .eq("status", "active")
    .maybeSingle();

  // Superseded before the replacement is written, because only one plan may be
  // active and the index would otherwise reject the insert.
  if (previous) {
    await supabase
      .from("operating_plans")
      .update({ status: "superseded", updated_at: now })
      .eq("id", previous.id as string);
  }

  await supabase.from("operating_plans").insert({
    company_id: cycle.company_id,
    operating_cycle_id: cycleId,
    summary: plan.summary,
    plan_json: { ...plan, phases: plan.phases.slice(0, MAX_PHASES) },
    status: "active",
    version: ((previous?.version as number | undefined) ?? 0) + 1,
  });

  await supabase
    .from("operating_cycles")
    .update({
      status: "active",
      started_at: cycle.started_at ?? now,
      updated_at: now,
    })
    .eq("id", cycleId);

  return { status: "active" };
}

/**
 * Looks at where the period stands and records what to do next.
 *
 * Cheap by design — it reads state rather than researching anything, so it can
 * run whenever something finishes. The output is advice and nothing else: no
 * project is created here.
 */
export async function runOperatingReview(
  cycleId: string,
  providers: Providers = defaultProviders(),
): Promise<Result<{ reviewId: string; recommendations: number }>> {
  const owned = await getOwnedCycle(cycleId);
  if (!owned) return { error: "Operation not found.", status: 404 };

  const { supabase, cycle } = owned;

  if (!["active", "review"].includes(cycle.status)) {
    return { error: "This operation isn't running.", status: 409 };
  }

  const blockedByLimit = await blockedBySpendLimit(supabase as Db, cycle.company_id);
  if (blockedByLimit) return { error: blockedByLimit, status: 402 };

  // Superseded rather than left open: a second waiting review would make it
  // ambiguous which recommendation the manager was answering.
  await supabase
    .from("operating_reviews")
    .update({ status: "dismissed", updated_at: new Date().toISOString() })
    .eq("operating_cycle_id", cycleId)
    .eq("status", "ready");

  const { data: planRow } = await supabase
    .from("operating_plans")
    .select("summary")
    .eq("operating_cycle_id", cycleId)
    .eq("status", "active")
    .maybeSingle();

  const { data: projectRows } = await supabase
    .from("projects")
    .select("id, title, goal, expected_outcome, status, progress_percentage")
    .eq("operating_cycle_id", cycleId);

  const projects = (projectRows ?? []) as {
    id: string;
    title: string;
    goal: string;
    expected_outcome: string | null;
    status: string;
    progress_percentage: number;
  }[];

  const completed: { title: string; goal: string; outcome: string }[] = [];

  for (const project of projects.filter((row) => row.status === "completed")) {
    const { data: brief } = await supabase
      .from("deliverables")
      .select("content_json")
      .eq("project_id", project.id)
      .eq("deliverable_scope", "project")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const content = brief?.content_json as { executiveSummary?: string } | null;

    completed.push({
      title: project.title,
      goal: project.goal,
      // The summary of what came back, not the whole brief — the review is
      // judging direction, not re-reading the work.
      outcome: content?.executiveSummary ?? "No summary recorded.",
    });
  }

  const awaiting = projects
    .filter((row) => ["awaiting_review", "failed", "needs_changes"].includes(row.status))
    .map((row) =>
      row.status === "awaiting_review"
        ? `"${row.title}" is waiting for your review`
        : `"${row.title}" needs your attention`,
    );

  const organization = await loadOrganization(supabase as Db, cycle.company_id);
  const company = await companyContextFor(supabase, cycle.company_id);

  const { system, input } = buildOperatingReviewPrompt(
    {
      cycleName: cycle.name,
      objective: cycle.objective,
      planSummary: (planRow?.summary as string) ?? "",
      completedProjects: completed,
      activeProjects: projects
        .filter((row) =>
          ["working", "preparing_final_deliverable", "plan_ready", "planning"].includes(
            row.status,
          ),
        )
        .map((row) => ({
          title: row.title,
          status: row.status,
          progress: row.progress_percentage,
        })),
      awaitingManager: awaiting,
      organization,
    },
    company,
  );

  const metered = meterProviders(providers, supabase as Db, {
    companyId: cycle.company_id,
  });

  let review;
  try {
    const result = await metered.ai.generateStructuredOutput({
      systemInstructions: system,
      input,
      schema: operatingReviewSchema,
      schemaName: "operating_review",
      maxTokens: 12000,
    });
    review = result.output;
  } catch {
    return { error: "The review couldn't be completed.", status: 502 };
  }

  const recommendations = review.recommendations.slice(0, MAX_RECOMMENDATIONS);

  const { data: created } = await supabase
    .from("operating_reviews")
    .insert({
      company_id: cycle.company_id,
      operating_cycle_id: cycleId,
      summary: review.summary,
      recommendations_json: recommendations,
      state_snapshot_json: {
        capturedAt: new Date().toISOString(),
        completed: completed.length,
        active: projects.filter((row) => row.status === "working").length,
        awaiting: awaiting.length,
        blockers: review.blockers,
        objectiveLooksMet: review.objectiveLooksMet,
      },
      status: "ready",
      reviewed_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (!created) return { error: "The review couldn't be saved.", status: 500 };

  return {
    reviewId: created.id as string,
    recommendations: recommendations.length,
  };
}

/**
 * Turns a recommendation the manager accepted into a project.
 *
 * A project in draft, not a project running. Day 12's plan-then-approve still
 * applies on top, so the manager sees who would do what before anything is
 * spent — two gates, because this one costs real money and the review is only
 * an opinion.
 */
export async function approveNextStep(
  cycleId: string,
  recommendationIndex: number,
): Promise<Result<{ projectId: string }>> {
  const owned = await getOwnedCycle(cycleId);
  if (!owned) return { error: "Operation not found.", status: 404 };

  const { supabase, cycle } = owned;

  const { data: reviewRow } = await supabase
    .from("operating_reviews")
    .select("id, recommendations_json")
    .eq("operating_cycle_id", cycleId)
    .eq("status", "ready")
    .maybeSingle();

  if (!reviewRow) {
    return { error: "There's nothing waiting for your decision.", status: 409 };
  }

  const recommendations = (reviewRow.recommendations_json ?? []) as Recommendation[];
  const chosen = recommendations[recommendationIndex];

  if (!chosen) return { error: "That recommendation doesn't exist.", status: 404 };

  if (chosen.needsManagerAction || !chosen.projectGoal.trim()) {
    return {
      error: "This one is for you to do — there's no work to hand over.",
      status: 400,
    };
  }

  const created = await createProject({
    title: chosen.title.slice(0, 200),
    goal: chosen.projectGoal,
    expectedOutcome: chosen.projectOutcome,
    priority: chosen.priority,
  });

  if ("error" in created) return created;

  const now = new Date().toISOString();

  await supabase
    .from("projects")
    .update({ operating_cycle_id: cycleId })
    .eq("id", created.projectId);

  const { count } = await supabase
    .from("operating_project_queue")
    .select("id", { count: "exact", head: true })
    .eq("operating_cycle_id", cycleId);

  await supabase.from("operating_project_queue").insert({
    company_id: cycle.company_id,
    operating_cycle_id: cycleId,
    project_id: created.projectId,
    operating_review_id: reviewRow.id as string,
    priority: chosen.priority,
    position: count ?? 0,
    status: "queued",
  });

  await supabase
    .from("operating_reviews")
    .update({ status: "approved", updated_at: now })
    .eq("id", reviewRow.id as string);

  return { projectId: created.projectId };
}

export async function dismissReview(
  cycleId: string,
): Promise<Result<{ status: string }>> {
  const owned = await getOwnedCycle(cycleId);
  if (!owned) return { error: "Operation not found.", status: 404 };

  const { data: dismissed } = await owned.supabase
    .from("operating_reviews")
    .update({ status: "dismissed", updated_at: new Date().toISOString() })
    .eq("operating_cycle_id", cycleId)
    .eq("status", "ready")
    .select("id")
    .maybeSingle();

  if (!dismissed) {
    return { error: "There's nothing waiting for your decision.", status: 409 };
  }

  return { status: "dismissed" };
}

/** Closes the period. The manager's call even when a review thought the
 *  objective was met — an operating system that ended its own cycles would be
 *  deciding when the company had succeeded. */
export async function completeCycle(
  cycleId: string,
): Promise<Result<{ status: string }>> {
  const owned = await getOwnedCycle(cycleId);
  if (!owned) return { error: "Operation not found.", status: 404 };

  const now = new Date().toISOString();

  const { data: completed } = await owned.supabase
    .from("operating_cycles")
    .update({ status: "completed", ended_at: now, updated_at: now })
    .eq("id", cycleId)
    .in("status", OPEN)
    .select("id")
    .maybeSingle();

  if (!completed) return { error: "This operation has already finished.", status: 409 };

  await owned.supabase
    .from("operating_reviews")
    .update({ status: "dismissed", updated_at: now })
    .eq("operating_cycle_id", cycleId)
    .eq("status", "ready");

  return { status: "completed" };
}

export interface CycleDetail {
  cycle: CycleRow;
  planSummary: string | null;
  phases: {
    name: string;
    intent: string;
    departments: string[];
    startsAfter: string;
  }[];
  projects: {
    id: string;
    title: string;
    status: string;
    progress: number;
    priority: string;
  }[];
  review: {
    id: string;
    /** Only a "ready" review is still asking for a decision. An acted-on one
     *  stays on the page because some of what it said was for the manager to
     *  do themselves, and approving a project shouldn't erase that. */
    status: ReviewStatus;
    summary: string;
    recommendations: Recommendation[];
    blockers: string[];
    objectiveLooksMet: boolean;
  } | null;
}

export async function loadCycleDetail(cycleId: string): Promise<CycleDetail | null> {
  const owned = await getOwnedCycle(cycleId);
  if (!owned) return null;

  const { supabase, cycle } = owned;

  const { data: planRow } = await supabase
    .from("operating_plans")
    .select("summary, plan_json")
    .eq("operating_cycle_id", cycleId)
    .eq("status", "active")
    .maybeSingle();

  const plan = planRow?.plan_json as {
    phases?: { name: string; intent: string; departments: string[]; startsAfter: string }[];
  } | null;

  const { data: queueRows } = await supabase
    .from("operating_project_queue")
    .select("priority, position, projects(id, title, status, progress_percentage)")
    .eq("operating_cycle_id", cycleId)
    .order("position", { ascending: true });

  // The latest review whatever its state, not just one awaiting a decision.
  const { data: reviewRow } = await supabase
    .from("operating_reviews")
    .select("id, status, summary, recommendations_json, state_snapshot_json")
    .eq("operating_cycle_id", cycleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const snapshot = reviewRow?.state_snapshot_json as {
    blockers?: string[];
    objectiveLooksMet?: boolean;
  } | null;

  return {
    cycle,
    planSummary: (planRow?.summary as string | undefined) ?? null,
    phases: plan?.phases ?? [],
    projects: ((queueRows ?? []) as unknown as {
      priority: string;
      projects: {
        id: string;
        title: string;
        status: string;
        progress_percentage: number;
      } | null;
    }[])
      .filter((row) => row.projects)
      .map((row) => ({
        id: row.projects!.id,
        title: row.projects!.title,
        status: row.projects!.status,
        progress: row.projects!.progress_percentage,
        priority: row.priority,
      })),
    review: reviewRow
      ? {
          id: reviewRow.id as string,
          status: reviewRow.status as ReviewStatus,
          summary: reviewRow.summary as string,
          recommendations: (reviewRow.recommendations_json ?? []) as Recommendation[],
          blockers: snapshot?.blockers ?? [],
          objectiveLooksMet: snapshot?.objectiveLooksMet ?? false,
        }
      : null,
  };
}
