import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { loadCandidates } from "@/lib/knowledge/service";
import type { CandidateStatus } from "@/lib/knowledge/types";

export async function GET(request: Request) {
  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const status = new URL(request.url).searchParams.get("status");
  const valid = ["pending", "approved", "rejected", "needs_revision"];

  return NextResponse.json({
    candidates: await loadCandidates(
      company.supabase,
      company.companyId,
      status && valid.includes(status) ? (status as CandidateStatus) : undefined,
    ),
  });
}
