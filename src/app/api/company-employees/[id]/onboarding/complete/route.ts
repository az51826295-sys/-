import { NextResponse } from "next/server";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { completeOnboarding } from "@/lib/onboarding/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owned = await getOwnedCompanyEmployee(id);

  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await completeOnboarding(owned);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
