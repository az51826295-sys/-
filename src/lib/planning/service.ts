import type { SupabaseClient } from "@supabase/supabase-js";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import type { Result } from "@/lib/assignments/service";
import {
  readCapacity,
  recordCapacity,
  type CapacityReading,
  type DepartmentCapacity,
} from "@/lib/planning/capacity";
import { RECOMMENDATION_PRIORITY } from "@/lib/intelligence/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export type OptionType =
  | "redistribute_work"
  | "cross_department_support"
  | "playbook_improvement"
  | "schedule_optimization"
  | "hire_employee";

export type PlanStatus =
  | "draft"
  | "recommended"
  | "approved"
  | "implemented"
  | "dismissed";

export interface StaffingOption {
  id: string;
  optionType: OptionType;
  summary: string;
  reasoning: string;
  estimatedImpact: string;
  impact: Record<string, number | string>;
  priority: number;
}

export interface WorkforcePlan {
  id: string;
  title: string;
  summary: string;
  status: PlanStatus;
  chosenOptionId: string | null;
  createdAt: string;
  options: StaffingOption[];
}

interface ProposedOption {
  optionType: OptionType;
  summary: string;
  reasoning: string;
  estimatedImpact: string;
  impact: Record<string, number | string>;
  priority: number;
}

/**
 * Works out the ways through a department's load.
 *
 * Every option here is an alternative to the others, not a step in a sequence —
 * the manager picks one. And every impact figure is arithmetic on numbers
 * already on the page: "four waiting across three people instead of one" rather
 * than "42% improvement". A percentage nobody can check is a number the manager
 * would be right to ignore, and inventing one would teach them to ignore the
 * ones that are real.
 */
function optionsFor(
  department: DepartmentCapacity,
  reading: CapacityReading,
): ProposedOption[] {
  const options: ProposedOption[] = [];
  const load = department.queueSize + department.forecastLoad;

  // Before anything else: are these people actually busy, or are they holding
  // finished work waiting on the manager? Recommending a hire to a manager
  // whose own review queue is the bottleneck would be an expensive answer to a
  // free problem.
  const waitingOnManager = reading.employees.filter(
    (employee) =>
      employee.departmentId === department.departmentId &&
      employee.state === "waiting_on_you",
  );

  if (waitingOnManager.length > 0) {
    options.push({
      optionType: "redistribute_work",
      summary: `Review what ${department.name} has already finished`,
      reasoning:
        "These people are not busy — they are waiting on you. Nothing else on this list frees capacity as fast, and this one costs nothing.",
      estimatedImpact: `${waitingOnManager.length} of ${department.memberCount} in ${department.name} ${waitingOnManager.length === 1 ? "is" : "are"} holding finished work. Reviewing it puts ${waitingOnManager.length === 1 ? "them" : "them all"} back to work today.`,
      impact: {
        waitingOnYou: waitingOnManager.length,
        people: department.memberCount,
      },
      priority: 5,
    });
  }

  if (department.freeCount > 0) {
    const perPerson = (load / department.memberCount).toFixed(1);
    options.push({
      optionType: "redistribute_work",
      summary: `Spread ${department.name}'s work across everyone free`,
      reasoning:
        "The department already has the people. Nothing about the organisation needs to change, and it costs nothing.",
      estimatedImpact: `${load} ${load === 1 ? "piece" : "pieces"} of work across ${department.memberCount} ${department.memberCount === 1 ? "person" : "people"} is ${perPerson} each, instead of stacking behind whoever is busy.`,
      impact: {
        load,
        people: department.memberCount,
        perPerson: Number(perPerson),
      },
      priority: RECOMMENDATION_PRIORITY.redistribute_work,
    });
  }

  const spare = reading.departments.find(
    (other) =>
      other.departmentId !== department.departmentId &&
      other.freeCount > 0 &&
      other.queueSize === 0,
  );

  if (spare) {
    options.push({
      optionType: "cross_department_support",
      summary: `Ask ${spare.name} to take some of ${department.name}'s work`,
      reasoning:
        "You already pay for that capacity and it is idle. Worth trying before adding anyone — though only work their skills actually cover can move.",
      estimatedImpact: `${spare.name} has ${spare.freeCount} ${spare.freeCount === 1 ? "person" : "people"} free and nothing queued.`,
      impact: { spareFree: spare.freeCount, spareDepartment: spare.name },
      priority: RECOMMENDATION_PRIORITY.cross_department_support,
    });
  }

  if (department.forecastLoad > department.queueSize && department.forecastLoad > 0) {
    options.push({
      optionType: "schedule_optimization",
      summary: `Space out what is scheduled to arrive in ${department.name}`,
      reasoning:
        "Most of this load is not here yet — it is recurring work you set up. Moving some of it apart costs nothing and is reversible.",
      estimatedImpact: `${department.forecastLoad} ${department.forecastLoad === 1 ? "piece" : "pieces"} of work is scheduled to arrive over the next ${reading.forecastDays} days, against ${department.queueSize} waiting now.`,
      impact: {
        scheduled: department.forecastLoad,
        waitingNow: department.queueSize,
        windowDays: reading.forecastDays,
      },
      priority: RECOMMENDATION_PRIORITY.optimize_schedule,
    });
  }

  options.push({
    optionType: "hire_employee",
    summary: `Add someone to ${department.name}`,
    reasoning:
      "The honest option when the others do not apply. It is also the only one with a cost every month afterwards, so it is offered last and never as a conclusion.",
    estimatedImpact: `One more person would take ${department.name} from ${department.memberCount} to ${department.memberCount + 1}, and ${load} ${load === 1 ? "piece" : "pieces"} of work from ${(load / Math.max(department.memberCount, 1)).toFixed(1)} each to ${(load / (department.memberCount + 1)).toFixed(1)}.`,
    impact: {
      load,
      peopleNow: department.memberCount,
      peopleAfter: department.memberCount + 1,
    },
    priority: RECOMMENDATION_PRIORITY.hire_employee,
  });

  return options.sort((a, b) => a.priority - b.priority);
}

/**
 * Looks at the company and writes plans for whatever is under strain.
 *
 * Free, like the diagnosis it builds on. A plan is written per department
 * rather than one for the whole company, because "Marketing is drowning and
 * Sales is idle" needs two different answers and merging them into one page
 * would hide that.
 */
export async function refreshPlanning(
  db: Db,
  companyId: string,
): Promise<{ plans: number; reading: CapacityReading }> {
  const reading = await readCapacity(db, companyId);
  await recordCapacity(db, companyId, reading);

  const strained = reading.departments.filter((department) =>
    reading.overCapacity.includes(department.departmentId),
  );

  const now = new Date().toISOString();
  const liveKeys = new Set(strained.map((d) => `capacity:${d.departmentId}`));

  for (const department of strained) {
    const signalKey = `capacity:${department.departmentId}`;

    // A plan the manager already decided on is left alone. Rewriting it would
    // erase a decision they made and re-ask a question they answered.
    const { data: prior } = await db
      .from("workforce_plans")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("signal_key", signalKey)
      .maybeSingle();

    if (prior && prior.status !== "recommended") continue;

    const load = department.queueSize + department.forecastLoad;

    const { data: plan } = await db
      .from("workforce_plans")
      .upsert(
        {
          company_id: companyId,
          title: `${department.name} is at capacity`,
          summary: `${department.queueSize} waiting now and ${department.forecastLoad} scheduled over the next ${reading.forecastDays} days, with nobody in ${department.name} free. Here are the ways through it.`,
          situation_json: {
            capturedAt: reading.capturedAt,
            department: department.name,
            queueSize: department.queueSize,
            forecastLoad: department.forecastLoad,
            memberCount: department.memberCount,
            freeCount: department.freeCount,
            load,
          },
          status: "recommended",
          signal_key: signalKey,
          updated_at: now,
        },
        { onConflict: "company_id,signal_key" },
      )
      .select("id")
      .maybeSingle();

    if (!plan) continue;

    const planId = plan.id as string;

    await db.from("staffing_options").delete().eq("workforce_plan_id", planId);

    await db.from("staffing_options").insert(
      optionsFor(department, reading).map((option) => ({
        company_id: companyId,
        workforce_plan_id: planId,
        option_type: option.optionType,
        summary: option.summary,
        reasoning: option.reasoning,
        estimated_impact: option.estimatedImpact,
        impact_json: option.impact,
        priority: option.priority,
      })),
    );
  }

  // A plan for a department that has since caught up is removed, unless the
  // manager acted on it — what they decided stays.
  const { data: open } = await db
    .from("workforce_plans")
    .select("id, signal_key")
    .eq("company_id", companyId)
    .eq("status", "recommended");

  const stale = ((open ?? []) as { id: string; signal_key: string }[]).filter(
    (row) => !liveKeys.has(row.signal_key),
  );

  if (stale.length > 0) {
    await db
      .from("workforce_plans")
      .delete()
      .in(
        "id",
        stale.map((row) => row.id),
      );
  }

  return { plans: strained.length, reading };
}

export async function loadPlans(
  db: Db,
  companyId: string,
): Promise<WorkforcePlan[]> {
  const { data } = await db
    .from("workforce_plans")
    .select("*, staffing_options(*)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as {
    id: string;
    title: string;
    summary: string;
    status: string;
    chosen_option_id: string | null;
    created_at: string;
    staffing_options: {
      id: string;
      option_type: string;
      summary: string;
      reasoning: string;
      estimated_impact: string;
      impact_json: Record<string, number | string> | null;
      priority: number;
    }[] | null;
  }[]).map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    status: row.status as PlanStatus,
    chosenOptionId: row.chosen_option_id,
    createdAt: row.created_at,
    options: (row.staffing_options ?? [])
      .map((option) => ({
        id: option.id,
        optionType: option.option_type as OptionType,
        summary: option.summary,
        reasoning: option.reasoning,
        estimatedImpact: option.estimated_impact,
        impact: option.impact_json ?? {},
        priority: option.priority,
      }))
      .sort((a, b) => a.priority - b.priority),
  }));
}

export async function loadPlanning(): Promise<{
  reading: CapacityReading;
  plans: WorkforcePlan[];
} | null> {
  const context = await getCompanyContext();
  if (!context) return null;

  const { supabase, companyId } = context;
  const { reading } = await refreshPlanning(supabase, companyId);

  return { reading, plans: await loadPlans(supabase, companyId) };
}

/** The numbers on the dashboard card. */
export async function loadPlanningSummary(
  db: Db,
  companyId: string,
): Promise<{ overCapacity: number; free: number; openPlans: number }> {
  const reading = await readCapacity(db, companyId);
  const { count } = await db
    .from("workforce_plans")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "recommended");

  return {
    overCapacity: reading.overCapacity.length,
    free: reading.employees.filter((employee) => employee.state === "free").length,
    openPlans: count ?? 0,
  };
}

/**
 * Records which way the manager decided to go.
 *
 * Nothing is carried out. Choosing "hire someone" does not hire anybody, and
 * choosing to redistribute does not move work — this records the decision and
 * sends them to the screen where they can act on it. A planner that executed
 * its own plans would be making staffing decisions on the manager's behalf.
 */
export async function choosePlanOption(
  planId: string,
  optionId: string,
): Promise<Result<{ optionType: OptionType }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Plan not found.", status: 404 };

  const { supabase, companyId } = context;

  const { data: plan } = await supabase
    .from("workforce_plans")
    .select("id, status")
    .eq("id", planId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!plan) return { error: "Plan not found.", status: 404 };
  if (plan.status !== "recommended") {
    return { error: "You've already decided on this one.", status: 409 };
  }

  const { data: option } = await supabase
    .from("staffing_options")
    .select("id, option_type")
    .eq("id", optionId)
    .eq("workforce_plan_id", planId)
    .maybeSingle();

  if (!option) return { error: "That isn't one of the options.", status: 404 };

  const now = new Date().toISOString();

  await supabase
    .from("workforce_plans")
    .update({
      status: "approved",
      chosen_option_id: optionId,
      decided_at: now,
      updated_at: now,
    })
    .eq("id", planId);

  return { optionType: option.option_type as OptionType };
}

export async function dismissPlan(planId: string): Promise<Result<{ ok: true }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Plan not found.", status: 404 };

  const now = new Date().toISOString();

  const { data } = await context.supabase
    .from("workforce_plans")
    .update({ status: "dismissed", decided_at: now, updated_at: now })
    .eq("id", planId)
    .eq("company_id", context.companyId)
    .eq("status", "recommended")
    .select("id")
    .maybeSingle();

  if (!data) return { error: "Plan not found.", status: 404 };

  return { ok: true };
}
