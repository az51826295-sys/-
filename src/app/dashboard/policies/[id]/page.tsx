import { notFound } from "next/navigation";
import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { loadPolicyDetail } from "@/lib/policies/service";
import { listPolicyChecks } from "@/lib/policies/checks";
import { formatAssignedDate } from "@/lib/assignments/labels";
import { policyCategoryLabel, policyStatusLabel } from "@/lib/policies/types";
import { PolicyEditor } from "../PolicyEditor";

export default async function PolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Another company's policy id simply isn't visible, so this is a 404 rather
  // than a distinction between absent and not yours.
  const detail = await loadPolicyDetail(id);
  if (!detail) notFound();

  const { policy, history, departments } = detail;

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{policy.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {policyCategoryLabel[policy.category]} · version {policy.version}
              {policy.status !== "active" && ` · ${policyStatusLabel[policy.status]}`}
            </p>
            {policy.description && (
              <p className="mt-2 text-sm text-zinc-600">{policy.description}</p>
            )}
          </div>
        </div>

        <PolicyEditor
          policyId={policy.id}
          status={policy.status}
          rules={policy.rules}
          departments={departments}
          appliedDepartmentIds={policy.departmentIds}
          checks={listPolicyChecks().map((check) => ({
            id: check.id,
            label: check.label,
            description: check.description,
            config: check.config ?? null,
          }))}
        />

        {history.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-900">History</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Work already in progress keeps the version it started under.
            </p>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {history.map((entry) => (
                <li
                  key={entry.version}
                  className="flex items-start justify-between gap-4 px-5 py-3"
                >
                  <div>
                    <p className="text-sm text-zinc-900">
                      v{entry.version}
                      <span className="ml-2 text-zinc-600">{entry.changeSummary}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {entry.ruleCount} {entry.ruleCount === 1 ? "rule" : "rules"}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-zinc-500">
                    {formatAssignedDate(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8">
          <Link href="/dashboard/policies" className="text-sm text-zinc-600 underline">
            All standards
          </Link>
        </div>
      </main>
    </div>
  );
}
