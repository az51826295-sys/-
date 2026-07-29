import { createClient } from "@/lib/supabase/server";
import type { LeadListDeliverable } from "@/lib/leads/types";

/**
 * What the last turn of this schedule produced.
 *
 * A weekly competitor review that reintroduces the same three competitors every
 * Monday is worthless; the manager wants what changed. Equally, a fortnightly
 * prospect list that returns the same companies is not new work. So each turn is
 * told what the previous approved one already covered.
 *
 * Only approved work counts. A deliverable the manager rejected describes
 * exactly the mistakes they asked to have fixed.
 */
export interface RecurringHistory {
  previousCompletedAt: string | null;
  /** Alex: the headings and implications already reported, so the next run can
   *  look for changes rather than restate them. */
  previousFindings: string[];
  previousSourceUrls: string[];
  /** Emma: companies already delivered and approved under this schedule. */
  previouslyDeliveredDomains: string[];
}

const MAX_PREVIOUS_FINDINGS = 12;
const MAX_PREVIOUS_SOURCES = 20;
const MAX_PREVIOUS_DOMAINS = 200;

export async function loadRecurringHistory(
  recurringAssignmentId: string,
  currentAssignmentId: string,
  db?: Awaited<ReturnType<typeof createClient>>,
): Promise<RecurringHistory> {
  const supabase = db ?? (await createClient());

  const empty: RecurringHistory = {
    previousCompletedAt: null,
    previousFindings: [],
    previousSourceUrls: [],
    previouslyDeliveredDomains: [],
  };

  // Reached through the assignments this schedule created, since a deliverable
  // knows its assignment but not the schedule behind it.
  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, completed_at")
    .eq("recurring_assignment_id", recurringAssignmentId)
    .neq("id", currentAssignmentId)
    .order("assigned_at", { ascending: false })
    .limit(20);

  const ids = (assignments ?? []).map((row) => row.id as string);
  if (ids.length === 0) return empty;

  const { data: deliverables } = await supabase
    .from("deliverables")
    .select("id, deliverable_type, content_json, approved_at")
    .in("assignment_id", ids)
    .eq("status", "approved")
    .order("approved_at", { ascending: false });

  const rows = (deliverables ?? []) as {
    id: string;
    deliverable_type: string;
    content_json: unknown;
    approved_at: string | null;
  }[];

  if (rows.length === 0) return empty;

  const latest = rows[0];

  // Every approved turn contributes companies, not just the latest one — a lead
  // list should not re-offer a company delivered three turns ago.
  const domains = new Set<string>();
  for (const row of rows) {
    if (row.deliverable_type !== "lead_list") continue;
    const content = row.content_json as LeadListDeliverable | null;
    for (const lead of content?.leads ?? []) {
      try {
        domains.add(new URL(lead.websiteUrl).hostname.replace(/^www\./, ""));
      } catch {
        // A row without a parsable address can't be deduplicated against.
      }
      if (domains.size >= MAX_PREVIOUS_DOMAINS) break;
    }
  }

  const findings: string[] = [];
  if (latest.deliverable_type === "market_research_report") {
    const content = latest.content_json as
      | { sections?: { heading: string }[]; keyImplications?: string[] }
      | null;

    for (const section of content?.sections ?? []) {
      if (findings.length >= MAX_PREVIOUS_FINDINGS) break;
      findings.push(section.heading);
    }
    for (const implication of content?.keyImplications ?? []) {
      if (findings.length >= MAX_PREVIOUS_FINDINGS) break;
      findings.push(implication);
    }
  }

  const { data: sources } = await supabase
    .from("deliverable_sources")
    .select("research_sources(url)")
    .eq("deliverable_id", latest.id)
    .limit(MAX_PREVIOUS_SOURCES);

  const sourceUrls = ((sources ?? []) as unknown as {
    research_sources: { url: string } | null;
  }[])
    .map((row) => row.research_sources?.url)
    .filter((url): url is string => Boolean(url));

  return {
    previousCompletedAt: latest.approved_at,
    previousFindings: findings,
    previousSourceUrls: sourceUrls,
    previouslyDeliveredDomains: [...domains],
  };
}
