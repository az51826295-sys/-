import type { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export type TimelineEventType =
  | "hired"
  | "department_created"
  | "playbook_published"
  | "knowledge_adopted"
  | "policy_changed"
  | "operation_closed"
  | "evolution_approved";

export interface TimelineEvent {
  at: string;
  type: TimelineEventType;
  summary: string;
}

export const timelineLabel: Record<TimelineEventType, string> = {
  hired: "Hired",
  department_created: "Organisation",
  playbook_published: "Method",
  knowledge_adopted: "Learning",
  policy_changed: "Standards",
  operation_closed: "Operation",
  evolution_approved: "Direction",
};

/**
 * How this company got to where it is.
 *
 * Derived from records that already carry the date they happened, rather than
 * from an event log written alongside them. The reason is drift: an event log
 * is only complete while every code path remembers to write to it, and the
 * first one that forgets leaves a history that is quietly wrong — which is
 * worse than no history, because nobody can tell.
 *
 * Everything here is already true whether or not anybody looks at it. Free to
 * assemble, and it cannot fall out of step with what actually happened.
 */
export async function buildTimeline(
  db: Db,
  companyId: string,
  limit = 40,
): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];

  const [hires, departments, playbooks, knowledge, policies, cycles, evolution] =
    await Promise.all([
      db
        .from("company_employees")
        .select("hired_at, created_at, employees(name, role)")
        .eq("company_id", companyId),
      db.from("departments").select("name, created_at").eq("company_id", companyId),
      db
        .from("playbook_versions")
        .select("name, version, change_summary, created_at")
        .eq("company_id", companyId),
      db
        .from("organization_knowledge")
        .select("title, created_at")
        .eq("company_id", companyId)
        .eq("status", "active"),
      db
        .from("policy_versions")
        .select("name, version, change_summary, created_at")
        .eq("company_id", companyId),
      db
        .from("operating_cycles")
        .select("name, ended_at")
        .eq("company_id", companyId)
        .eq("status", "completed")
        .not("ended_at", "is", null),
      db
        .from("workforce_evolution_plans")
        .select("title, decided_at")
        .eq("company_id", companyId)
        .eq("status", "approved")
        .not("decided_at", "is", null),
    ]);

  for (const row of (hires.data ?? []) as unknown as {
    hired_at: string | null;
    created_at: string;
    employees: { name: string; role: string } | null;
  }[]) {
    events.push({
      at: row.hired_at ?? row.created_at,
      type: "hired",
      summary: `${row.employees?.name ?? "Someone"} joined as ${row.employees?.role ?? "an employee"}`,
    });
  }

  for (const row of (departments.data ?? []) as {
    name: string;
    created_at: string;
  }[]) {
    events.push({
      at: row.created_at,
      type: "department_created",
      summary: `${row.name} became a department`,
    });
  }

  for (const row of (playbooks.data ?? []) as {
    name: string;
    version: number;
    change_summary: string;
    created_at: string;
  }[]) {
    events.push({
      at: row.created_at,
      type: "playbook_published",
      summary: `${row.name} v${row.version}${row.change_summary ? ` — ${row.change_summary}` : ""}`,
    });
  }

  for (const row of (knowledge.data ?? []) as {
    title: string;
    created_at: string;
  }[]) {
    events.push({
      at: row.created_at,
      type: "knowledge_adopted",
      summary: `The company adopted: ${row.title}`,
    });
  }

  for (const row of (policies.data ?? []) as {
    name: string;
    version: number;
    change_summary: string;
    created_at: string;
  }[]) {
    events.push({
      at: row.created_at,
      type: "policy_changed",
      summary: `${row.name} v${row.version}${row.change_summary ? ` — ${row.change_summary}` : ""}`,
    });
  }

  for (const row of (cycles.data ?? []) as { name: string; ended_at: string }[]) {
    events.push({
      at: row.ended_at,
      type: "operation_closed",
      summary: `${row.name} closed`,
    });
  }

  for (const row of (evolution.data ?? []) as {
    title: string;
    decided_at: string;
  }[]) {
    events.push({
      at: row.decided_at,
      type: "evolution_approved",
      summary: `You accepted a change of direction: ${row.title}`,
    });
  }

  return events
    .filter((event) => Boolean(event.at))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}
