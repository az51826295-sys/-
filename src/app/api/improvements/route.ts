import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { loadImprovements, refreshImprovements } from "@/lib/company/improvements";

export async function GET() {
  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await refreshImprovements(company.supabase, company.companyId);

  return NextResponse.json({
    improvements: await loadImprovements(company.supabase, company.companyId),
  });
}
