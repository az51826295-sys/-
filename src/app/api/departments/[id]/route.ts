import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const patch: Record<string, string> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim().slice(0, 60);
  }
  if (typeof body.description === "string") {
    patch.description = body.description.slice(0, 500);
  }

  // Row level security scopes departments by owner, so another company's id
  // matches nothing and the answer is 404 rather than a distinction between
  // "absent" and "not yours".
  const { data } = await company.supabase
    .from("departments")
    .update(patch)
    .eq("id", id)
    .eq("company_id", company.companyId)
    .select("id")
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "Department not found." }, { status: 404 });
  }

  return NextResponse.json({ departmentId: data.id });
}
