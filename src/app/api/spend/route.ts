import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { checkAllowance } from "@/lib/costs/allowance";

/** Read-only. There is no route that changes the limit, on purpose — the
 *  account this constrains is the account that would be raising it. */
export async function GET() {
  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    await checkAllowance(company.supabase, company.companyId),
  );
}
