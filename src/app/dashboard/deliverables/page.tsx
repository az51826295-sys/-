import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";
import {
  deliverableStatusClass,
  deliverableStatusLabel,
  formatAssignedDate,
} from "@/lib/assignments/labels";
import { labelForDeliverableType } from "@/lib/assignments/workforce";
import type { Assignment, Deliverable, Employee } from "@/lib/types";

const tabs = [
  { key: "all", label: "All", status: null, empty: "No deliverables yet." },
  {
    key: "submitted",
    label: "Pending Review",
    status: "submitted",
    empty: "Nothing needs your review.",
  },
  {
    key: "approved",
    label: "Approved",
    status: "approved",
    empty: "No approved deliverables yet.",
  },
  {
    key: "needs_changes",
    label: "Needs Changes",
    status: "needs_changes",
    empty: "No deliverables need changes.",
  },
] as const;

/** A report and a lead list answer different questions, so the manager filters
 *  by what they're looking for rather than by who produced it. */
const TYPE_FILTERS = [
  { key: "all", label: "All Types", deliverableType: null },
  {
    key: "reports",
    label: "Market Research Reports",
    deliverableType: "market_research_report",
  },
  { key: "leads", label: "Lead Lists", deliverableType: "lead_list" },
] as const;

function hrefFor(statusKey: string, typeKey: string): string {
  const query = new URLSearchParams();
  if (statusKey !== "all") query.set("status", statusKey);
  if (typeKey !== "all") query.set("type", typeKey);
  const search = query.toString();
  return search ? `/dashboard/deliverables?${search}` : "/dashboard/deliverables";
}

function verifiedLeadCount(deliverable: {
  deliverable_type: string;
  content_json: unknown;
}): number | null {
  if (deliverable.deliverable_type !== "lead_list") return null;
  const content = deliverable.content_json as { verifiedCount?: unknown } | null;
  return typeof content?.verifiedCount === "number" ? content.verifiedCount : null;
}

export default async function DeliverablesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const { status, type } = await searchParams;
  const tab = tabs.find((t) => t.key === status) ?? tabs[0];
  const typeFilter = TYPE_FILTERS.find((entry) => entry.key === type) ?? TYPE_FILTERS[0];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // The inner join plus the filter is what hides work done for a colleague:
  // that deliverable belongs to the employee who asked for it, and the manager
  // reads the finished piece it fed into, not the errand.
  let query = supabase
    .from("deliverables")
    .select(
      "*, assignments!inner(id, title, assignment_type), company_employees!deliverables_company_employee_id_fkey(id, employees(name, role))",
    )
    .eq("assignments.assignment_type", "manager")
    .order("submitted_at", { ascending: false });

  if (tab.status) {
    query = query.eq("status", tab.status);
  }
  if (typeFilter.deliverableType) {
    query = query.eq("deliverable_type", typeFilter.deliverableType);
  }

  const { data } = await query;

  const deliverables = (data ?? []) as (Deliverable & {
    assignments: Pick<Assignment, "id" | "title">;
    company_employees: { id: string; employees: Pick<Employee, "name" | "role"> };
  })[];

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">Deliverables</h1>

        <div className="mt-6 flex gap-1 border-b border-zinc-200">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={hrefFor(t.key, typeFilter.key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                tab.key === t.key
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {TYPE_FILTERS.map((entry) => (
            <Link
              key={entry.key}
              href={hrefFor(tab.key, entry.key)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                typeFilter.key === entry.key
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {entry.label}
            </Link>
          ))}
        </div>

        {deliverables.length === 0 ? (
          <div className="mt-10 text-center">
            <p className="font-medium text-zinc-900">{tab.empty}</p>
            {tab.key === "all" && (
              <p className="mt-1 text-sm text-zinc-500">
                Your employees&apos; completed work will appear here.
              </p>
            )}
            {tab.key === "submitted" && (
              <p className="mt-1 text-sm text-zinc-500">
                Your employees will notify you when work is ready.
              </p>
            )}
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {deliverables.map((deliverable) => {
              const employee = deliverable.company_employees?.employees;
              return (
                <li key={deliverable.id}>
                  <Link
                    href={`/dashboard/deliverables/${deliverable.id}`}
                    className="flex items-center justify-between px-5 py-4 hover:bg-zinc-50"
                  >
                    <div>
                      <p className="font-medium text-zinc-900">{deliverable.title}</p>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {employee?.name} &middot;{" "}
                        {labelForDeliverableType(deliverable.deliverable_type)}
                      </p>
                      {verifiedLeadCount(deliverable) !== null && (
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {verifiedLeadCount(deliverable)} verified{" "}
                          {verifiedLeadCount(deliverable) === 1
                            ? "company"
                            : "companies"}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-zinc-400">
                        Assignment: {deliverable.assignments?.title}
                      </p>
                      {deliverable.submitted_at && (
                        <p className="text-xs text-zinc-400">
                          Submitted {formatAssignedDate(deliverable.submitted_at)}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${deliverableStatusClass[deliverable.status]}`}
                    >
                      {deliverableStatusLabel[deliverable.status]}
                    </span>
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
