import { redirect } from "next/navigation";
import Link from "next/link";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { NavBar } from "@/components/NavBar";
import { formatAssignedDate } from "@/lib/assignments/labels";
import {
  cycleStatusClass,
  cycleStatusLabel,
  type CycleStatus,
} from "@/lib/operations/types";
import type { CycleRow } from "@/lib/operations/service";
import { NewOperationForm } from "./NewOperationForm";

export default async function OperationsPage() {
  const company = await getCompanyContext();
  if (!company) redirect("/company/new");

  const { data } = await company.supabase
    .from("operating_cycles")
    .select("*")
    .order("created_at", { ascending: false });

  const cycles = (data ?? []) as CycleRow[];
  const open = cycles.find((cycle) =>
    ["planning", "active", "review"].includes(cycle.status),
  );

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">Operations</h1>
        <p className="mt-1 text-sm text-zinc-500">
          What your company is working through, and what comes next.
        </p>

        {/* One at a time. A company working in two directions has two answers
            to "what are we doing". */}
        {open ? (
          <Link
            href={`/dashboard/operations/${open.id}`}
            className="mt-8 block rounded-lg border border-zinc-900 px-5 py-4 hover:bg-zinc-50"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-zinc-500">Current operation</p>
                <p className="mt-1 font-medium text-zinc-900">{open.name}</p>
                <p className="mt-1 text-sm text-zinc-600">{open.objective}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${cycleStatusClass[open.status as CycleStatus]}`}
              >
                {cycleStatusLabel[open.status as CycleStatus]}
              </span>
            </div>
          </Link>
        ) : (
          <NewOperationForm />
        )}

        {cycles.filter((cycle) => cycle.id !== open?.id).length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-900">Earlier</h2>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {cycles
                .filter((cycle) => cycle.id !== open?.id)
                .map((cycle) => (
                  <li key={cycle.id}>
                    <Link
                      href={`/dashboard/operations/${cycle.id}`}
                      className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-zinc-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{cycle.name}</p>
                        <p className="mt-0.5 text-xs text-zinc-400">
                          {cycle.ended_at
                            ? `Closed ${formatAssignedDate(cycle.ended_at)}`
                            : `Started ${formatAssignedDate(cycle.created_at)}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {cycleStatusLabel[cycle.status as CycleStatus]}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
