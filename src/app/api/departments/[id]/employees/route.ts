import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";

/** Moves an employee into this department. One department each, so this is a
 *  move rather than an addition — the unique constraint makes that literal. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const companyEmployeeId = String(body?.companyEmployeeId ?? "");

  if (!companyEmployeeId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data: department } = await company.supabase
    .from("departments")
    .select("id")
    .eq("id", id)
    .eq("company_id", company.companyId)
    .maybeSingle();

  if (!department) {
    return NextResponse.json({ error: "Department not found." }, { status: 404 });
  }

  // Checked separately: a valid department plus somebody else's employee must
  // not become a way to reach across companies.
  const { data: hire } = await company.supabase
    .from("company_employees")
    .select("id")
    .eq("id", companyEmployeeId)
    .eq("company_id", company.companyId)
    .maybeSingle();

  if (!hire) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const { error } = await company.supabase.from("department_members").upsert(
    {
      company_id: company.companyId,
      department_id: id,
      company_employee_id: companyEmployeeId,
    },
    { onConflict: "company_employee_id" },
  );

  if (error) {
    return NextResponse.json({ error: "I couldn't move them." }, { status: 500 });
  }

  return NextResponse.json({ status: "moved" });
}
