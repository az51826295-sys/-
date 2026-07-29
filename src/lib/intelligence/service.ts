import type { SupabaseClient } from "@supabase/supabase-js";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import type { Result } from "@/lib/assignments/service";
import { loadCompanySnapshot } from "@/lib/intelligence/snapshot";
import { runDetectors } from "@/lib/intelligence/detectors";
import { proposeRecommendations } from "@/lib/intelligence/recommendations";
import {
  healthFrom,
  severityRank,
  type ActionType,
  type Health,
  type Insight,
  type InsightCategory,
  type Recommendation,
  type RecommendationCategory,
  type RecommendationStatus,
  type Severity,
} from "@/lib/intelligence/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

/**
 * Looks at the company and writes down what it sees.
 *
 * Free to run, and safe to run often — which is the point. Every number here
 * comes from work that already happened, so a manager can ask "how are we
 * doing" as many times a day as they like without it appearing on a bill.
 *
 * Rewrites rather than accumulates. Yesterday's reading of the same fact is not
 * history worth keeping; it is a stale number sitting next to the true one.
 */
export async function refreshIntelligence(
  db: Db,
  companyId: string,
): Promise<{ insights: number; recommendations: number }> {
  const snapshot = await loadCompanySnapshot(db, companyId);
  const detected = runDetectors(snapshot);
  const proposed = proposeRecommendations(snapshot, detected);

  const now = new Date().toISOString();
  const liveInsightKeys = new Set(detected.map((insight) => insight.signalKey));

  for (const insight of detected) {
    await db.from("workforce_insights").upsert(
      {
        company_id: companyId,
        category: insight.category,
        title: insight.title,
        summary: insight.summary,
        measurements_json: insight.measurements,
        severity: insight.severity,
        signal_key: insight.signalKey,
        subject_type: insight.subjectType,
        subject_id: insight.subjectId,
        observed_at: now,
      },
      { onConflict: "company_id,signal_key" },
    );
  }

  // An insight that no longer holds is deleted rather than kept. "Marketing has
  // work waiting" stops being true the moment the work starts, and leaving it
  // on the page would make the diagnosis a record of past worries.
  const { data: existing } = await db
    .from("workforce_insights")
    .select("id, signal_key")
    .eq("company_id", companyId);

  const stale = ((existing ?? []) as { id: string; signal_key: string }[]).filter(
    (row) => !liveInsightKeys.has(row.signal_key),
  );

  if (stale.length > 0) {
    await db
      .from("workforce_insights")
      .delete()
      .in(
        "id",
        stale.map((row) => row.id),
      );
  }

  // Recommendations need their insight's id, so they are written after.
  const { data: insightRows } = await db
    .from("workforce_insights")
    .select("id, signal_key")
    .eq("company_id", companyId);

  const insightIdByKey = new Map(
    ((insightRows ?? []) as { id: string; signal_key: string }[]).map((row) => [
      row.signal_key,
      row.id,
    ]),
  );

  const liveRecommendationKeys = new Set(proposed.map((row) => row.signalKey));

  for (const recommendation of proposed) {
    // A recommendation the manager already decided on is left exactly as it is.
    // Re-proposing something they turned down this morning would make the page
    // argue with them.
    const { data: prior } = await db
      .from("workforce_recommendations")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("signal_key", recommendation.signalKey)
      .maybeSingle();

    if (prior && prior.status !== "new") continue;

    const { data: saved } = await db
      .from("workforce_recommendations")
      .upsert(
        {
          company_id: companyId,
          insight_id: recommendation.insightSignalKey
            ? (insightIdByKey.get(recommendation.insightSignalKey) ?? null)
            : null,
          category: recommendation.category,
          title: recommendation.title,
          description: recommendation.description,
          reasoning: recommendation.reasoning,
          priority: recommendation.priority,
          signal_key: recommendation.signalKey,
          status: "new",
          updated_at: now,
        },
        { onConflict: "company_id,signal_key" },
      )
      .select("id")
      .maybeSingle();

    if (!saved) continue;

    await db
      .from("recommendation_actions")
      .delete()
      .eq("recommendation_id", saved.id as string);

    await db.from("recommendation_actions").insert({
      company_id: companyId,
      recommendation_id: saved.id as string,
      action_type: recommendation.action.type,
      payload_json: recommendation.action.payload,
    });
  }

  // Undecided recommendations whose reason has gone away are removed. Ones the
  // manager acted on stay: what they decided is part of the record.
  const { data: existingRecommendations } = await db
    .from("workforce_recommendations")
    .select("id, signal_key, status")
    .eq("company_id", companyId)
    .eq("status", "new");

  const staleRecommendations = (
    (existingRecommendations ?? []) as { id: string; signal_key: string }[]
  ).filter((row) => !liveRecommendationKeys.has(row.signal_key));

  if (staleRecommendations.length > 0) {
    await db
      .from("workforce_recommendations")
      .delete()
      .in(
        "id",
        staleRecommendations.map((row) => row.id),
      );
  }

  return { insights: detected.length, recommendations: proposed.length };
}

// --- Reading -------------------------------------------------------------

export async function loadInsights(
  db: Db,
  companyId: string,
): Promise<Insight[]> {
  const { data } = await db
    .from("workforce_insights")
    .select("*")
    .eq("company_id", companyId);

  return ((data ?? []) as {
    id: string;
    category: string;
    title: string;
    summary: string;
    measurements_json: Record<string, number | string> | null;
    severity: string;
    signal_key: string;
    subject_type: string;
    subject_id: string | null;
    observed_at: string;
  }[])
    .map((row) => ({
      id: row.id,
      category: row.category as InsightCategory,
      title: row.title,
      summary: row.summary,
      measurements: row.measurements_json ?? {},
      severity: row.severity as Severity,
      signalKey: row.signal_key,
      subjectType: row.subject_type as Insight["subjectType"],
      subjectId: row.subject_id,
      observedAt: row.observed_at,
    }))
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

export async function loadRecommendations(
  db: Db,
  companyId: string,
  status?: RecommendationStatus,
): Promise<Recommendation[]> {
  let query = db
    .from("workforce_recommendations")
    .select("*, recommendation_actions(action_type, payload_json)")
    .eq("company_id", companyId)
    .order("priority", { ascending: true });

  if (status) query = query.eq("status", status);

  const { data } = await query;

  return ((data ?? []) as unknown as {
    id: string;
    insight_id: string | null;
    category: string;
    title: string;
    description: string;
    reasoning: string;
    priority: number;
    status: string;
    signal_key: string;
    created_at: string;
    recommendation_actions:
      | { action_type: string; payload_json: Record<string, unknown> }[]
      | null;
  }[]).map((row) => {
    const action = row.recommendation_actions?.[0];
    return {
      id: row.id,
      insightId: row.insight_id,
      category: row.category as RecommendationCategory,
      title: row.title,
      description: row.description,
      reasoning: row.reasoning,
      priority: row.priority,
      status: row.status as RecommendationStatus,
      signalKey: row.signal_key,
      action: action
        ? {
            type: action.action_type as ActionType,
            payload: action.payload_json ?? {},
          }
        : null,
      createdAt: row.created_at,
    };
  });
}

export async function loadIntelligence(): Promise<{
  health: Health;
  insights: Insight[];
  recommendations: Recommendation[];
} | null> {
  const context = await getCompanyContext();
  if (!context) return null;

  const { supabase, companyId } = context;

  // Refreshed on read. It costs nothing, and a diagnosis the manager has to
  // remember to ask for is one they will read stale.
  await refreshIntelligence(supabase, companyId);

  const insights = await loadInsights(supabase, companyId);

  return {
    health: healthFrom(insights),
    insights,
    recommendations: await loadRecommendations(supabase, companyId),
  };
}

/** The numbers on the dashboard card. */
export async function loadHealthSummary(
  db: Db,
  companyId: string,
): Promise<{
  health: Health;
  insights: number;
  open: number;
  /**
   * The most serious thing found, in its own words.
   *
   * The home screen used to report a count — "1 thing worth knowing" — which
   * is a status light with no bulb in it. A manager reading that has learned
   * only that something exists, and has to click to find out whether it is
   * "one department is slightly ahead of schedule" or "nothing has been
   * reviewed in nine days". Naming the worst one costs nothing: it is already
   * computed, and it was already being counted.
   */
  top: { title: string; summary: string; severity: Severity } | null;
}> {
  // Refreshed on read, for the same reason the Intelligence screen does it:
  // detection is arithmetic and costs nothing, and an insight that is only
  // recomputed when somebody opens the detail page outlives the thing it
  // describes. This card was reporting "finished work is waiting on you" to a
  // company with nothing pending, because the row had been written days
  // earlier and the only code that deletes it runs on a screen nobody had
  // opened since.
  await refreshIntelligence(db, companyId);

  const insights = await loadInsights(db, companyId);
  const { count } = await db
    .from("workforce_recommendations")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "new");

  // severityRank counts up from critical: 0, so ascending is worst first.
  const worst = [...insights].sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity],
  )[0];

  return {
    health: healthFrom(insights),
    insights: insights.length,
    open: count ?? 0,
    top: worst
      ? {
          title: worst.title,
          summary: worst.summary,
          severity: worst.severity,
        }
      : null,
  };
}

// --- Deciding ------------------------------------------------------------

export async function decideRecommendation(
  recommendationId: string,
  decision: "approved" | "dismissed" | "completed",
): Promise<Result<{ action: { type: ActionType; payload: Record<string, unknown> } | null }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Recommendation not found.", status: 404 };

  const { supabase, companyId } = context;

  const { data: existing } = await supabase
    .from("workforce_recommendations")
    .select("id, status, recommendation_actions(action_type, payload_json)")
    .eq("id", recommendationId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!existing) return { error: "Recommendation not found.", status: 404 };

  if (existing.status === "dismissed" || existing.status === "completed") {
    return { error: "You've already decided on this one.", status: 409 };
  }

  const now = new Date().toISOString();

  await supabase
    .from("workforce_recommendations")
    .update({ status: decision, decided_at: now, updated_at: now })
    .eq("id", recommendationId);

  // Approving hands back where to go. Nothing is carried out here: this system
  // diagnoses and suggests, and every actual change still happens on a screen
  // the manager is looking at.
  const action = (
    existing as unknown as {
      recommendation_actions:
        | { action_type: string; payload_json: Record<string, unknown> }[]
        | null;
    }
  ).recommendation_actions?.[0];

  return {
    action: action
      ? { type: action.action_type as ActionType, payload: action.payload_json ?? {} }
      : null,
  };
}
