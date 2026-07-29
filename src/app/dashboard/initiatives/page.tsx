import { redirect } from "next/navigation";
import Link from "next/link";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { NavBar } from "@/components/NavBar";
import { formatAssignedDate } from "@/lib/assignments/labels";
import {
  confidenceClass,
  confidenceLabel,
  initiativeStatusLabel,
  observationKindLabel,
  type InitiativeRow,
  type InitiativeStatus,
  type ObservationKind,
} from "@/lib/initiatives/types";
import type { Employee } from "@/lib/types";

const tabs = [
  { key: "new", label: "New", status: "new" },
  { key: "approved", label: "Approved", status: "approved" },
  { key: "dismissed", label: "Dismissed", status: "dismissed" },
  { key: "all", label: "All", status: null },
] as const;

const emptyCopy: Record<string, string> = {
  new: "No new recommendations.",
  approved: "You haven't approved any recommendations yet.",
  dismissed: "You haven't dismissed any recommendations.",
  all: "No recommendations yet.",
};

export default async function InitiativesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const tab = tabs.find((entry) => entry.key === status) ?? tabs[0];

  const company = await getCompanyContext();
  if (!company) redirect("/company/new");

  let query = company.supabase
    .from("initiatives")
    .select("*, company_employees(id, employees(name, role, slug))")
    .order("created_at", { ascending: false });

  if (tab.status) query = query.eq("status", tab.status);

  const { data } = await query;

  const rows = (data ?? []) as (InitiativeRow & {
    company_employees: {
      id: string;
      employees: Pick<Employee, "name" | "role" | "slug">;
    };
  })[];

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">Recommendations</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Work your employees think is worth doing. Nothing starts until you say
          so.
        </p>

        <div className="mt-6 flex gap-1 border-b border-zinc-200">
          {tabs.map((entry) => (
            <Link
              key={entry.key}
              href={
                entry.key === "new"
                  ? "/dashboard/initiatives"
                  : `/dashboard/initiatives?status=${entry.key}`
              }
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                tab.key === entry.key
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {entry.label}
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="mt-10 text-center">
            <p className="font-medium text-zinc-900">{emptyCopy[tab.key]}</p>
            <p className="mt-1 text-sm text-zinc-500">
              Your employees look for opportunities on their own and bring you
              anything worth acting on.
            </p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {rows.map((row) => {
              const employee = row.company_employees?.employees;
              const kind = row.evidence_json?.[0]?.kind as ObservationKind | undefined;

              return (
                <li key={row.id}>
                  <Link
                    href={`/dashboard/initiatives/${row.id}`}
                    className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-zinc-50"
                  >
                    <div>
                      <p className="font-medium text-zinc-900">{row.title}</p>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {employee?.name} &middot; {employee?.role}
                      </p>
                      <p className="mt-1 text-sm text-zinc-700">
                        {row.recommendation}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {kind ? `${observationKindLabel[kind]} · ` : ""}
                        {row.evidence_json?.length ?? 0}{" "}
                        {(row.evidence_json?.length ?? 0) === 1 ? "source" : "sources"}
                        {" · "}
                        {formatAssignedDate(row.created_at)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${confidenceClass[row.confidence]}`}
                      >
                        {confidenceLabel[row.confidence]}
                      </span>
                      {row.status !== "new" && (
                        <span className="text-xs text-zinc-500">
                          {initiativeStatusLabel[row.status as InitiativeStatus]}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
