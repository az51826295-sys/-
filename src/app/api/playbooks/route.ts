import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { createPlaybook, loadPlaybooks } from "@/lib/playbooks/service";
import { templatesForSkills } from "@/lib/playbooks/catalog";
import { getEmployeeDefinition } from "@/lib/employees/definitions";

export async function GET() {
  const company = await getCompanyContext();
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const playbooks = await loadPlaybooks(company.supabase, company.companyId);

  // Only methods for work this company actually does. Offering a content
  // marketing playbook to a company with no writer is noise.
  const { data: hires } = await company.supabase
    .from("company_employees")
    .select("employees(slug)")
    .eq("company_id", company.companyId);

  const skillIds = ((hires ?? []) as unknown as {
    employees: { slug: string } | null;
  }[])
    .map((row) => (row.employees?.slug ? getEmployeeDefinition(row.employees.slug)?.skillId : null))
    .filter((skillId): skillId is string => Boolean(skillId));

  const adopted = new Set(playbooks.map((playbook) => playbook.name.toLowerCase()));

  return NextResponse.json({
    playbooks,
    available: templatesForSkills(skillIds)
      .filter((template) => !adopted.has(template.name.toLowerCase()))
      .map((template) => ({
        key: template.key,
        name: template.name,
        description: template.description,
        skillId: template.skillId,
        stages: template.stages.map((stage) => stage.title),
        stepCount: template.stages.reduce(
          (sum, stage) => sum + stage.steps.length,
          0,
        ),
      })),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const result = await createPlaybook({
    templateKey: body?.templateKey ? String(body.templateKey) : undefined,
    name: body?.name !== undefined ? String(body.name) : undefined,
    description:
      body?.description !== undefined ? String(body.description) : undefined,
    departmentId: body?.departmentId ? String(body.departmentId) : undefined,
    skillId: body?.skillId ? String(body.skillId) : undefined,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result, { status: 201 });
}
