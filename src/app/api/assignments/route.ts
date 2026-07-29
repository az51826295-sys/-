import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ASSIGNMENT_STATUSES } from "@/lib/assignments/service";

const COMPLETED_STATUSES = ["submitted", "completed"];

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const statusFilter = request.nextUrl.searchParams.get("status");

  // Internal work belongs to the employee who asked for it, not to this list.
  let query = supabase
    .from("assignments")
    .select(
      "*, company_employees!assignments_company_employee_id_fkey(id, employees(name, role))",
    )
    .eq("assignment_type", "manager")
    .order("assigned_at", { ascending: false });

  if (statusFilter === "active") {
    query = query.in("status", [...ACTIVE_ASSIGNMENT_STATUSES]);
  } else if (statusFilter === "completed") {
    query = query.in("status", COMPLETED_STATUSES);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assignments: data ?? [] });
}
