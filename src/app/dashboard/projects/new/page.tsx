import { redirect } from "next/navigation";
import Link from "next/link";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { NavBar } from "@/components/NavBar";
import { loadCandidates } from "@/lib/projects/staffing";
import { NewProjectForm } from "./NewProjectForm";

export default async function NewProjectPage() {
  const company = await getCompanyContext();
  if (!company) redirect("/company/new");

  // Checked before the form rather than after submitting it: a manager with
  // nobody to do the work should be told that now, not after typing a goal.
  const candidates = await loadCandidates(company.supabase, company.companyId);

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">Start a Project</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Say what you want done. The work gets divided between the right people
          and comes back as one result.
        </p>

        {candidates.length === 0 ? (
          <div className="mt-8 rounded-lg border border-zinc-200 p-6">
            <p className="text-sm text-zinc-700">
              Hire and train at least one employee before starting a project.
            </p>
            <Link
              href="/employees"
              className="mt-4 inline-block rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Browse Employees
            </Link>
          </div>
        ) : (
          <NewProjectForm />
        )}
      </main>
    </div>
  );
}
