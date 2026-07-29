import { createClient } from "@/lib/supabase/server";
import { loadWorkContext, type EmployeeWorkContextV5 } from "@/lib/execution/context";
import { MAX_REUSED_SOURCES } from "@/lib/execution/types";
import type { Deliverable, DeliverableReview } from "@/lib/types";

/**
 * Everything a revision needs: the assignment as before, plus the deliverable
 * being revised, the manager's feedback, and the sources the first run already
 * collected. Loaded through the caller's session, so RLS makes it impossible to
 * assemble a revision out of another company's rows.
 */
export interface RevisionWorkContext {
  base: EmployeeWorkContextV5;
  previousDeliverable: {
    id: string;
    version: number;
    title: string;
    contentMarkdown: string;
    contentJson: unknown;
  };
  managerFeedback: {
    reviewId: string | null;
    revisionRequestId: string;
    feedback: string;
  };
  existingSources: {
    id: string;
    title: string;
    url: string;
    normalizedUrl: string;
    publishedAt: string | null;
    fetchStatus: string;
    content: string;
  }[];
  targetVersion: number;
}

export type RevisionContextResult =
  | { ok: true; context: RevisionWorkContext }
  | { ok: false; missing: string[] };

export async function loadRevisionContext(
  executionId: string,
): Promise<RevisionContextResult> {
  const supabase = await createClient();

  const { data: execution } = await supabase
    .from("work_executions")
    .select("*")
    .eq("id", executionId)
    .maybeSingle();

  if (!execution) return { ok: false, missing: ["Work execution"] };

  const missing: string[] = [];

  const { data: revisionRequest } = await supabase
    .from("revision_requests")
    .select("*")
    .eq("id", execution.revision_request_id ?? "")
    .maybeSingle();

  if (!revisionRequest) missing.push("Revision request");
  if (!revisionRequest?.feedback?.trim()) missing.push("Manager feedback");

  const { data: previous } = await supabase
    .from("deliverables")
    .select("*")
    .eq("id", execution.source_deliverable_id ?? "")
    .maybeSingle<Deliverable>();

  if (!previous) missing.push("Previous deliverable");

  // Revising anything but the newest version would branch the history.
  if (previous) {
    const { data: latest } = await supabase
      .from("deliverables")
      .select("version")
      .eq("assignment_id", previous.assignment_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest && (latest.version as number) > previous.version) {
      missing.push("Previous deliverable is no longer the latest version");
    }
    if (previous.status !== "needs_changes") {
      missing.push("Previous deliverable is not awaiting revision");
    }
  }

  const baseResult = await loadWorkContext(execution.assignment_id);
  if (!baseResult.ok) {
    missing.push(...baseResult.missing);
  }

  if (missing.length > 0 || !baseResult.ok || !previous || !revisionRequest) {
    return { ok: false, missing };
  }

  // Sources from every prior execution on this assignment, so a revision still
  // sees what earlier runs gathered.
  const { data: sourceRows } = await supabase
    .from("research_sources")
    .select(
      "id, title, url, normalized_url, published_at, fetch_status, content_text, trust_score, relevance_score, created_at",
    )
    .eq("assignment_id", previous.assignment_id)
    .eq("selected_for_deliverable", true);

  // Anything the previous version cited must survive — dropping it would
  // orphan a citation the manager is reading right now.
  const { data: citedRows } = await supabase
    .from("deliverable_sources")
    .select("research_source_id")
    .eq("deliverable_id", previous.id);

  const citedIds = new Set(
    (citedRows ?? []).map((row) => row.research_source_id as string),
  );

  const seen = new Set<string>();
  const candidates = (sourceRows ?? [])
    .filter((row) => {
      const key = row.normalized_url as string;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => ({
      id: row.id as string,
      title: row.title as string,
      url: row.url as string,
      normalizedUrl: row.normalized_url as string,
      publishedAt: (row.published_at as string | null) ?? null,
      fetchStatus: row.fetch_status as string,
      content: (row.content_text as string | null) ?? "",
      cited: citedIds.has(row.id as string),
      score:
        ((row.trust_score as number) ?? 0) + ((row.relevance_score as number) ?? 0),
    }));

  // Capped, because each failed attempt leaves its finds behind: without a
  // ceiling every retry would carry a larger context than the one before it.
  const existingSources = candidates
    .sort((a, b) => {
      if (a.cited !== b.cited) return a.cited ? -1 : 1;
      return b.score - a.score;
    })
    .slice(0, MAX_REUSED_SOURCES)
    .map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      normalizedUrl: source.normalizedUrl,
      publishedAt: source.publishedAt,
      fetchStatus: source.fetchStatus,
      content: source.content,
    }));

  return {
    ok: true,
    context: {
      base: baseResult.context,
      previousDeliverable: {
        id: previous.id,
        version: previous.version,
        title: previous.title,
        contentMarkdown: previous.content_markdown,
        contentJson: previous.content_json,
      },
      managerFeedback: {
        reviewId: (revisionRequest.deliverable_review_id as string | null) ?? null,
        revisionRequestId: revisionRequest.id as string,
        feedback: revisionRequest.feedback as string,
      },
      existingSources,
      targetVersion: (execution.target_version as number) ?? previous.version + 1,
    },
  };
}

export type { DeliverableReview };
