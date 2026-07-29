import { createClient } from "@/lib/supabase/server";
import type { Result } from "@/lib/assignments/service";
import {
  INTERNAL_REQUEST_TIMEOUT_HOURS,
  type InternalRequestRow,
} from "@/lib/collaboration/types";
import type { Employee } from "@/lib/types";

export interface CollaborationView {
  id: string;
  title: string;
  description: string;
  status: InternalRequestRow["status"];
  requesterName: string;
  assigneeName: string;
  assigneeRole: string;
  childAssignmentId: string | null;
  failureCode: string | null;
  requestedAt: string;
  completedAt: string | null;
}

type Joined = InternalRequestRow & {
  requester: { employees: Pick<Employee, "name"> } | null;
  assignee: { employees: Pick<Employee, "name" | "role"> } | null;
};

/**
 * The collaboration on one assignment, as the manager would read it.
 *
 * Two foreign keys point from internal_requests to company_employees, so both
 * embeds are named explicitly — without the names PostgREST cannot tell which
 * side is which and returns nothing at all.
 */
export async function listCollaboration(
  parentAssignmentId: string,
): Promise<CollaborationView[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("internal_requests")
    .select(
      "*, requester:company_employees!internal_requests_requester_company_employee_id_fkey(employees(name)), assignee:company_employees!internal_requests_assignee_company_employee_id_fkey(employees(name, role))",
    )
    .eq("parent_assignment_id", parentAssignmentId)
    .order("requested_at", { ascending: true });

  return ((data ?? []) as unknown as Joined[]).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    requesterName: row.requester?.employees?.name ?? "An employee",
    assigneeName: row.assignee?.employees?.name ?? "a colleague",
    assigneeRole: row.assignee?.employees?.role ?? "",
    childAssignmentId: row.child_assignment_id,
    failureCode: row.failure_code,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
  }));
}

export async function getOwnedRequest(
  requestId: string,
): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; request: InternalRequestRow } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("internal_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle<InternalRequestRow>();

  if (!data) return null;
  return { supabase, request: data };
}

/**
 * Stops a request that hasn't finished.
 *
 * The colleague's own work is cancelled with it — they were only doing it
 * because they were asked, and leaving it running would hold them busy for a
 * result nobody will use.
 */
export async function cancelRequest(
  requestId: string,
): Promise<Result<{ status: string }>> {
  const owned = await getOwnedRequest(requestId);
  if (!owned) return { error: "Request not found.", status: 404 };

  const { supabase, request } = owned;

  const { data: cancelled } = await supabase
    .from("internal_requests")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .in("status", ["pending", "working"])
    .select("id")
    .maybeSingle();

  if (!cancelled) {
    return { error: "This request has already finished.", status: 409 };
  }

  if (request.child_assignment_id) {
    await supabase
      .from("assignments")
      .update({ status: "cancelled" })
      .eq("id", request.child_assignment_id)
      .not("status", "in", "(completed,submitted)");
  }

  await supabase
    .from("company_employees")
    .update({ work_status: "ready", current_assignment_id: null })
    .eq("id", request.assignee_company_employee_id);

  return { status: "cancelled" };
}

/**
 * Fails requests that have been open too long.
 *
 * A run that died mid-flight leaves a colleague marked as helping and a
 * requester marked as waiting, and neither will ever resolve on its own. This
 * is what stops that state being permanent.
 */
export async function failStaleRequests(): Promise<number> {
  const supabase = await createClient();

  const cutoff = new Date(
    Date.now() - INTERNAL_REQUEST_TIMEOUT_HOURS * 3_600_000,
  ).toISOString();

  const { data } = await supabase
    .from("internal_requests")
    .update({
      status: "failed",
      failure_code: "TIMED_OUT",
      failure_message: "This request went unanswered for too long.",
      failed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("status", ["pending", "working"])
    .lt("requested_at", cutoff)
    .select("assignee_company_employee_id");

  const rows = (data ?? []) as { assignee_company_employee_id: string }[];

  // Colleagues left holding cancelled work go back to ready, or they would
  // never take another assignment.
  for (const row of rows) {
    await supabase
      .from("company_employees")
      .update({ work_status: "ready", current_assignment_id: null })
      .eq("id", row.assignee_company_employee_id);
  }

  return rows.length;
}
