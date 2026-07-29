import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { createPolicy, loadPolicies } from "@/lib/policies/service";

export async function GET() {
  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    policies: await loadPolicies(company.supabase, company.companyId),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const result = await createPolicy({
    templateKey: body?.templateKey ? String(body.templateKey) : undefined,
    name: body?.name !== undefined ? String(body.name) : undefined,
    category: body?.category !== undefined ? String(body.category) : undefined,
    description:
      body?.description !== undefined ? String(body.description) : undefined,
    departmentIds: Array.isArray(body?.departmentIds)
      ? body.departmentIds.map(String)
      : undefined,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result, { status: 201 });
}
