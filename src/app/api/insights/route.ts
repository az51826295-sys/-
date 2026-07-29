import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { loadInsights, refreshIntelligence } from "@/lib/intelligence/service";

export async function GET() {
  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await refreshIntelligence(company.supabase, company.companyId);

  return NextResponse.json({
    insights: await loadInsights(company.supabase, company.companyId),
  });
}
