import { redirect } from "next/navigation";
import Link from "next/link";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { NavBar } from "@/components/NavBar";
import { loadPlaybooks } from "@/lib/playbooks/service";
import { templatesForSkills } from "@/lib/playbooks/catalog";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { playbookStatusClass, playbookStatusLabel } from "@/lib/playbooks/types";
import { AdoptPlaybook } from "./AdoptPlaybook";

export default async function PlaybooksPage() {
  const company = await getCompanyContext();
  if (!company) redirect("/company/new");

  const playbooks = await loadPlaybooks(company.supabase, company.companyId);

  const { data: hires } = await company.supabase
    .from("company_employees")
    .select("employees(slug)")
    .eq("company_id", company.companyId);

  const skillIds = ((hires ?? []) as unknown as {
    employees: { slug: string } | null;
  }[])
    .map((row) =>
      row.employees?.slug ? getEmployeeDefinition(row.employees.slug)?.skillId : null,
    )
    .filter((skillId): skillId is string => Boolean(skillId));

  const adopted = new Set(playbooks.map((playbook) => playbook.name.toLowerCase()));
  const available = templatesForSkills(skillIds).filter(
    (template) => !adopted.has(template.name.toLowerCase()),
  );

  const inUse = playbooks.filter((playbook) => playbook.status === "active");

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">Playbooks</h1>
        <p className="mt-1 text-sm text-zinc-500">
          How {company.companyName ?? "your company"} does its work. Written once,
          followed by everyone who does that kind of work.
        </p>

        {playbooks.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-600">
            No playbooks yet. Your employees work to their professional judgement
            — which is real judgement, but it means the same job done twice can
            come back two different ways.
          </p>
        ) : (
          <ul className="mt-8 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {playbooks.map((playbook) => {
              const steps = playbook.stages.reduce(
                (sum, stage) => sum + stage.steps.length,
                0,
              );

              return (
                <li key={playbook.id}>
                  <Link
                    href={`/dashboard/playbooks/${playbook.id}`}
                    className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-zinc-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        {playbook.name}
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-600">
                        {playbook.description}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">
                        {playbook.stages.length}{" "}
                        {playbook.stages.length === 1 ? "stage" : "stages"} ·{" "}
                        {steps} {steps === 1 ? "step" : "steps"}
                        {playbook.departmentName
                          ? ` · ${playbook.departmentName}`
                          : " · whole company"}
                        {playbook.status === "active" && ` · v${playbook.version}`}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                        playbookStatusClass[playbook.status]
                      }`}
                    >
                      {playbookStatusLabel[playbook.status]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {inUse.length === 0 && playbooks.length > 0 && (
          <p className="mt-4 text-sm text-zinc-600">
            None of these is in use yet. A draft shapes nobody&apos;s work until
            you publish it.
          </p>
        )}

        {available.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-900">
              Methods you could start from
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Adopted as a draft, so you can read and change it before anybody
              works to it.
            </p>
            <AdoptPlaybook
              templates={available.map((template) => ({
                key: template.key,
                name: template.name,
                description: template.description,
                stages: template.stages.map((stage) => ({
                  title: stage.title,
                  intent: stage.intent,
                  steps: stage.steps.map((step) => step.instruction),
                })),
              }))}
            />
          </section>
        )}
      </main>
    </div>
  );
}
