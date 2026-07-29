import type { SupabaseClient } from "@supabase/supabase-js";
import { INTERNAL_REQUEST_TIMEOUT_HOURS } from "@/lib/collaboration/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

/**
 * Fails requests that have been open too long, across every company.
 *
 * The scheduler's version of the same sweep the manager's client does for one
 * company: it runs on a timer with the service client, because a colleague
 * stuck helping nobody is a state that has to clear itself whether or not
 * anyone opens the dashboard.
 */
export async function failStaleInternalRequests(db: Db): Promise<number> {
  const cutoff = new Date(
    Date.now() - INTERNAL_REQUEST_TIMEOUT_HOURS * 3_600_000,
  ).toISOString();

  const now = new Date().toISOString();

  const { data } = await db
    .from("internal_requests")
    .update({
      status: "failed",
      failure_code: "TIMED_OUT",
      failure_message: "This request went unanswered for too long.",
      failed_at: now,
      updated_at: now,
    })
    .in("status", ["pending", "working"])
    .lt("requested_at", cutoff)
    .select("assignee_company_employee_id, child_assignment_id");

  const rows = (data ?? []) as {
    assignee_company_employee_id: string;
    child_assignment_id: string | null;
  }[];

  for (const row of rows) {
    if (row.child_assignment_id) {
      await db
        .from("assignments")
        .update({ status: "failed", failure_reason: "The request timed out." })
        .eq("id", row.child_assignment_id)
        .not("status", "in", "(completed,submitted)");
    }

    // Released, or they would never take another assignment.
    await db
      .from("company_employees")
      .update({ work_status: "ready", current_assignment_id: null })
      .eq("id", row.assignee_company_employee_id);
  }

  return rows.length;
}
