import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { buildTimeline } from "@/lib/company/timeline";

export async function GET() {
  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    timeline: await buildTimeline(company.supabase, company.companyId, 100),
  });
}
