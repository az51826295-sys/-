import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { loadRoleGaps, refreshEvolution } from "@/lib/evolution/service";

export async function GET() {
  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await refreshEvolution(company.supabase, company.companyId);

  return NextResponse.json({
    gaps: await loadRoleGaps(company.supabase, company.companyId),
  });
}
