import { redirect } from "next/navigation";
import Link from "next/link";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { NavBar } from "@/components/NavBar";
import { loadPolicies } from "@/lib/policies/service";
import { POLICY_CATALOG } from "@/lib/policies/catalog";
import {
  POLICY_CATEGORIES,
  policyCategoryLabel,
  policyStatusLabel,
} from "@/lib/policies/types";
import { AdoptStandard } from "./AdoptStandard";

export default async function PoliciesPage() {
  const company = await getCompanyContext();
  if (!company) redirect("/company/new");

  const policies = await loadPolicies(company.supabase, company.companyId);

  const ruleCount = policies
    .filter((policy) => policy.status === "active")
    .reduce(
      (sum, policy) => sum + policy.rules.filter((rule) => rule.enabled).length,
      0,
    );

  const adopted = new Set(policies.map((policy) => policy.name.toLowerCase()));
  const available = POLICY_CATALOG.filter(
    (template) => !adopted.has(template.name.toLowerCase()),
  );

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">Company Standards</h1>
        <p className="mt-1 text-sm text-zinc-500">
          How {company.companyName ?? "your company"} works. Everyone follows
          this — change it once and it applies to all of them.
        </p>

        <dl className="mt-6 grid grid-cols-3 gap-3">
          {[
            {
              label: "Policies",
              value: policies.filter((policy) => policy.status === "active").length,
            },
            { label: "Rules", value: ruleCount },
            {
              label: "Last changed",
              value: policies.length > 0 ? formatDay(policies) : "—",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-zinc-200 px-4 py-3"
            >
              <dt className="text-xs text-zinc-500">{item.label}</dt>
              <dd className="mt-1 text-xl font-semibold text-zinc-900">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        {policies.length === 0 ? (
          <p className="mt-10 text-sm text-zinc-600">
            You haven&apos;t set any standards yet. Your employees work to their
            professional judgement until you do — which is fine, until two of
            them make the same call differently.
          </p>
        ) : (
          <div className="mt-8 space-y-8">
            {POLICY_CATEGORIES.map((category) => {
              const inCategory = policies.filter(
                (policy) => policy.category === category,
              );
              if (inCategory.length === 0) return null;

              return (
                <section key={category}>
                  <h2 className="text-sm font-medium text-zinc-900">
                    {policyCategoryLabel[category]}
                  </h2>
                  <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                    {inCategory.map((policy) => {
                      const enabled = policy.rules.filter((rule) => rule.enabled);
                      const required = enabled.filter(
                        (rule) => rule.priority === "required",
                      ).length;

                      return (
                        <li key={policy.id}>
                          <Link
                            href={`/dashboard/policies/${policy.id}`}
                            className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-zinc-50"
                          >
                            <div>
                              <p className="text-sm font-medium text-zinc-900">
                                {policy.name}
                                {policy.status !== "active" && (
                                  <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-normal text-zinc-500">
                                    {policyStatusLabel[policy.status]}
                                  </span>
                                )}
                              </p>
                              <p className="mt-0.5 text-sm text-zinc-600">
                                {policy.description}
                              </p>
                              <p className="mt-2 text-xs text-zinc-500">
                                {enabled.length}{" "}
                                {enabled.length === 1 ? "rule" : "rules"}
                                {required > 0 && ` · ${required} required`}
                                {policy.departmentIds.length > 0
                                  ? ` · ${policy.departmentIds.length} department${
                                      policy.departmentIds.length === 1 ? "" : "s"
                                    }`
                                  : " · whole company"}
                              </p>
                            </div>
                            <span className="shrink-0 text-xs text-zinc-400">
                              v{policy.version}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        {available.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-900">
              Standards you could adopt
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Written out in full so you can read them before agreeing to them.
              Nothing is applied until you say so, and every rule stays editable.
            </p>
            <AdoptStandard
              templates={available.map((template) => ({
                key: template.key,
                name: template.name,
                description: template.description,
                category: policyCategoryLabel[template.category],
                rules: template.rules.map((rule) => ({
                  title: rule.title,
                  instruction: rule.instruction,
                  priority: rule.priority,
                  checked: Boolean(rule.checkId),
                })),
              }))}
            />
          </section>
        )}
      </main>
    </div>
  );
}

function formatDay(policies: { updatedAt: string }[]): string {
  const latest = policies.map((policy) => policy.updatedAt).sort().at(-1);
  if (!latest) return "—";

  const date = new Date(latest);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();

  return sameDay
    ? "Today"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
