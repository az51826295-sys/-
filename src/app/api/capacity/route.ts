import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { readCapacity } from "@/lib/planning/capacity";

/** Free to compute, so it is read live rather than from the last snapshot. */
export async function GET() {
  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(await readCapacity(company.supabase, company.companyId));
}
