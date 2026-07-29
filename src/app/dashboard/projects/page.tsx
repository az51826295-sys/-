import { redirect } from "next/navigation";
import Link from "next/link";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { NavBar } from "@/components/NavBar";
import { formatAssignedDate } from "@/lib/assignments/labels";
import {
  projectStatusClass,
  projectStatusLabel,
  type ProjectStatus,
} from "@/lib/projects/types";
import type { ProjectRow } from "@/lib/projects/service";

/** States where a percentage is a fact about the work rather than about nothing
 *  having happened yet. */
const IN_FLIGHT = ["working", "merging", "review_ready"];

export default async function ProjectsPage() {
  const company = await getCompanyContext();
  if (!company) redirect("/company/new");

  const { data } = await company.supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  const projects = (data ?? []) as ProjectRow[];

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Projects</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Goals your workforce is working on together.
            </p>
          </div>
          <Link
            href="/dashboard/projects/new"
            className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            New Project
          </Link>
        </div>

        {projects.length === 0 ? (
          <p className="mt-10 text-center text-sm text-zinc-500">No projects yet.</p>
        ) : (
          <ul className="mt-8 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/dashboard/projects/${project.id}`}
                  className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-zinc-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-zinc-900">{project.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-zinc-600">
                      {project.goal}
                    </p>

                    {/*
                      A project that has a plan but has not been started said
                      "Started 28 July", which was false — nothing had started,
                      and the only thing standing between it and the work was
                      the person reading this line. Every state now says what
                      is actually true of it, and the one waiting on the
                      manager says so.
                    */}
                    {project.status === "plan_ready" ? (
                      <p className="mt-1 text-xs font-medium text-amber-700">
                        Planned and waiting for you to start it
                      </p>
                    ) : project.status === "draft" ? (
                      <p className="mt-1 text-xs text-zinc-400">
                        No plan yet · {formatAssignedDate(project.created_at)}
                      </p>
                    ) : IN_FLIGHT.includes(project.status) ? (
                      <div className="mt-2">
                        <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-zinc-900"
                            style={{ width: `${project.progress_percentage}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">
                          {project.progress_percentage}% complete
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-400">
                        {formatAssignedDate(
                          project.completed_at ?? project.created_at,
                        )}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${projectStatusClass[project.status as ProjectStatus]}`}
                  >
                    {projectStatusLabel[project.status as ProjectStatus]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
