import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { internalRequestStatusLabel } from "@/lib/collaboration/types";
import type { InternalRequestRow } from "@/lib/collaboration/types";
import type { Employee } from "@/lib/types";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parentAssignmentId = request.nextUrl.searchParams.get("assignmentId");

  // Both embeds are named: two foreign keys run from this table to
  // company_employees, and an unnamed embed is ambiguous and returns nothing.
  let query = supabase
    .from("internal_requests")
    .select(
      "*, requester:company_employees!internal_requests_requester_company_employee_id_fkey(employees(name)), assignee:company_employees!internal_requests_assignee_company_employee_id_fkey(employees(name, role))",
    )
    .order("requested_at", { ascending: false });

  if (parentAssignmentId) {
    query = query.eq("parent_assignment_id", parentAssignmentId);
  }

  const { data } = await query;

  const rows = (data ?? []) as unknown as (InternalRequestRow & {
    requester: { employees: Pick<Employee, "name"> } | null;
    assignee: { employees: Pick<Employee, "name" | "role"> } | null;
  })[];

  return NextResponse.json({
    requests: rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      statusLabel: internalRequestStatusLabel[row.status],
      requesterName: row.requester?.employees?.name ?? null,
      assigneeName: row.assignee?.employees?.name ?? null,
      parentAssignmentId: row.parent_assignment_id,
      childAssignmentId: row.child_assignment_id,
      requestedAt: row.requested_at,
      completedAt: row.completed_at,
    })),
  });
}
