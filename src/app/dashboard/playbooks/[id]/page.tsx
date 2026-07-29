import { notFound } from "next/navigation";
import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { loadPlaybookDetail } from "@/lib/playbooks/service";
import { formatAssignedDate } from "@/lib/assignments/labels";
import { playbookStatusClass, playbookStatusLabel } from "@/lib/playbooks/types";
import { PlaybookEditor } from "../PlaybookEditor";

export default async function PlaybookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Another company's playbook id simply isn't visible.
  const detail = await loadPlaybookDetail(id);
  if (!detail) notFound();

  const { playbook, history, departments, timesUsed } = detail;

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{playbook.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {playbook.departmentName ?? "Whole company"}
              {playbook.status === "active" && ` · version ${playbook.version}`}
              {timesUsed > 0 &&
                ` · used on ${timesUsed} ${timesUsed === 1 ? "assignment" : "assignments"}`}
            </p>
            {playbook.description && (
              <p className="mt-2 text-sm text-zinc-600">{playbook.description}</p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              playbookStatusClass[playbook.status]
            }`}
          >
            {playbookStatusLabel[playbook.status]}
          </span>
        </div>

        <PlaybookEditor
          playbookId={playbook.id}
          status={playbook.status}
          version={playbook.version}
          stages={playbook.stages}
          qualityChecks={playbook.qualityChecks}
          departments={departments}
          departmentId={playbook.departmentId}
        />

        {history.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-900">History</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Work already under way keeps the version it started with.
            </p>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {history.map((entry) => (
                <li
                  key={entry.version}
                  className="flex items-start justify-between gap-4 px-5 py-3"
                >
                  <p className="text-sm text-zinc-900">
                    v{entry.version}
                    <span className="ml-2 text-zinc-600">{entry.changeSummary}</span>
                  </p>
                  <p className="shrink-0 text-xs text-zinc-500">
                    {formatAssignedDate(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8">
          <Link href="/dashboard/playbooks" className="text-sm text-zinc-600 underline">
            All playbooks
          </Link>
        </div>
      </main>
    </div>
  );
}
