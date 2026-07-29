import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { loadKnowledge, loadPlaybookDrafts } from "@/lib/knowledge/service";

export async function GET() {
  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    knowledge: await loadKnowledge(company.supabase, company.companyId),
    playbookDrafts: await loadPlaybookDrafts(company.supabase, company.companyId),
  });
}
