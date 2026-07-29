import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const allowedStatuses = ["submitted", "approved", "needs_changes"];

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const status = request.nextUrl.searchParams.get("status");

  let query = supabase
    .from("deliverables")
    .select(
      "*, assignments(id, title), company_employees!deliverables_company_employee_id_fkey(id, employees(name, role))",
    )
    .order("submitted_at", { ascending: false });

  if (status && allowedStatuses.includes(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deliverables: data ?? [] });
}
