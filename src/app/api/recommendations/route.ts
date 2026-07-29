import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { loadRecommendations } from "@/lib/intelligence/service";
import type { RecommendationStatus } from "@/lib/intelligence/types";

export async function GET(request: Request) {
  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const status = new URL(request.url).searchParams.get("status");
  const valid = ["new", "reviewing", "approved", "dismissed", "completed"];

  return NextResponse.json({
    recommendations: await loadRecommendations(
      company.supabase,
      company.companyId,
      status && valid.includes(status) ? (status as RecommendationStatus) : undefined,
    ),
  });
}
