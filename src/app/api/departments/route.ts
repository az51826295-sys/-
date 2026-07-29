import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { ensureOrganization, loadOrganization } from "@/lib/departments/service";

const NAME_MAX = 60;

export async function GET() {
  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await ensureOrganization(company.supabase, company.companyId);
  return NextResponse.json({
    departments: await loadOrganization(company.supabase, company.companyId),
  });
}

export async function POST(request: Request) {
  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "Give the department a name." }, { status: 400 });
  }
  if (name.length > NAME_MAX) {
    return NextResponse.json(
      { error: `Keep the name under ${NAME_MAX} characters.` },
      { status: 400 },
    );
  }

  const { data, error } = await company.supabase
    .from("departments")
    .insert({
      company_id: company.companyId,
      name,
      description: body?.description ? String(body.description).slice(0, 500) : null,
    })
    .select("id")
    .maybeSingle();

  // The unique index on (company, name) is what rejects a duplicate; catching
  // it here turns a database error into something the manager can act on.
  if (error || !data) {
    return NextResponse.json(
      { error: "A department with that name already exists." },
      { status: 409 },
    );
  }

  return NextResponse.json({ departmentId: data.id }, { status: 201 });
}
