import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { buildTimeline, type TimelineEvent } from "@/lib/company/timeline";
import {
  loadImprovements,
  measureImpacts,
  refreshImprovements,
  type Improvement,
  type MeasuredImpact,
} from "@/lib/company/improvements";
import { loadHealthSummary } from "@/lib/intelligence/service";
import { usageForCompany } from "@/lib/costs/service";
import type { Health } from "@/lib/intelligence/types";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REPORT_DAYS = 30;

export interface CycleReport {
  days: number;
  projectsCompleted: number;
  deliverablesApproved: number;
  learningAdopted: number;
  playbookVersions: number;
  organisationChanges: number;
  spentUsd: number;
}

export interface CompanyView {
  companyName: string;
  health: Health;
  openInsights: number;
  report: CycleReport;
  improvements: Improvement[];
  timeline: TimelineEvent[];
  impacts: MeasuredImpact[];
}

/**
 * The company, on one page.
 *
 * Everything here is counted from what has already happened. The last thing
 * this product should do on its final day is start estimating: a manager
 * reading a summary of their own company needs to be able to click through to
 * the thing each number came from, and every one of these can be.
 */
export async function loadCompanyView(): Promise<CompanyView | null> {
  const context = await getCompanyContext();
  if (!context) return null;

  const { supabase, companyId, companyName } = context;
  const since = new Date(Date.now() - REPORT_DAYS * DAY_MS).toISOString();

  await refreshImprovements(supabase, companyId);

  const [projects, deliverables, knowledge, playbooks, departments] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "completed")
        .gte("completed_at", since),
      supabase
        .from("deliverables")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "approved")
        .gte("updated_at", since),
      supabase
        .from("organization_knowledge")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "active")
        .gte("created_at", since),
      supabase
        .from("playbook_versions")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gte("created_at", since),
      supabase
        .from("workforce_evolution_plans")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "approved")
        .gte("decided_at", since),
    ]);

  const health = await loadHealthSummary(supabase, companyId);
  const spend = await usageForCompany(companyId, REPORT_DAYS);

  return {
    companyName: companyName ?? "Your company",
    health: health.health,
    openInsights: health.insights,
    report: {
      days: REPORT_DAYS,
      projectsCompleted: projects.count ?? 0,
      deliverablesApproved: deliverables.count ?? 0,
      learningAdopted: knowledge.count ?? 0,
      playbookVersions: playbooks.count ?? 0,
      organisationChanges: departments.count ?? 0,
      spentUsd: spend.totalUsd,
    },
    improvements: (await loadImprovements(supabase, companyId)).filter(
      (item) => item.status === "detected" || item.status === "proposed",
    ),
    timeline: await buildTimeline(supabase, companyId),
    impacts: await measureImpacts(supabase, companyId),
  };
}

export interface CompanyFacts {
  ownerLabel: string;
  headcount: number;
  finishedRecently: number;
}

/**
 * The four things a person wants when they open a page called "Company".
 *
 * Kept out of the page component because working out "the last 24 hours"
 * requires reading the clock, and a component that reads the clock is not a
 * pure function of its inputs.
 *
 * It is 24 hours rather than "today" on purpose. The server does not know
 * where midnight is for the person reading, and a number labelled "today" that
 * quietly means "since midnight UTC" is worse than an honest window.
 */
export async function loadCompanyFacts(): Promise<CompanyFacts | null> {
  const company = await getCompanyContext();
  if (!company) return null;

  const { supabase, companyId } = company;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [headcount, finished] = await Promise.all([
    supabase
      .from("company_employees")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("deliverables")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("submitted_at", since),
  ]);

  return {
    ownerLabel: user?.email?.split("@")[0] ?? "You",
    headcount: headcount.count ?? 0,
    finishedRecently: finished.count ?? 0,
  };
}
