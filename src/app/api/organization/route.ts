import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { ensureOrganization, loadOrganization } from "@/lib/departments/service";

export async function GET() {
  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Reconciled on read, so a company that hired somebody since the last look
  // sees them in a department rather than nowhere.
  await ensureOrganization(company.supabase, company.companyId);
  const departments = await loadOrganization(company.supabase, company.companyId);

  return NextResponse.json({
    departments,
    employeeCount: departments.reduce((sum, d) => sum + d.employeeCount, 0),
  });
}
