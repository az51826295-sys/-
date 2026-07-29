import { redirect } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { loadEvolution } from "@/lib/evolution/service";
import { EvolutionActions, GapActions } from "./EvolutionActions";

const CHANGE_LABEL: Record<string, string> = {
  hire_employee: "Hire",
  create_department: "New department",
  split_department: "Split a department",
  merge_department: "Merge departments",
  create_playbook: "Write a method",
  expand_role: "Move somebody",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "Seen repeatedly",
  medium: "Seen more than once",
  low: "Seen once",
};

export default async function EvolutionPage() {
  const evolution = await loadEvolution();
  if (!evolution) redirect("/company/new");

  const { gaps, plan } = evolution;
  const open = plan?.status === "recommended" ? plan : null;

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">
          How the company would need to change
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Drawn from work you actually asked for and the company could not do —
          not from guessing at what you might want next.
        </p>

        {gaps.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-600">
            No gaps. Nothing has been asked for that the company had nobody for,
            no department owns work its people cannot do, and nothing has gone
            unanswered. This is the honest reading of a company doing the work it
            is set up to do.
          </p>
        ) : (
          <section className="mt-8">
            <h2 className="text-sm font-medium text-zinc-900">
              What the company keeps needing and cannot do
            </h2>
            <ul className="mt-3 space-y-3">
              {gaps.map((gap) => (
                <li key={gap.id} className="rounded-lg border border-zinc-200 p-5">
                  <p className="text-sm font-medium text-zinc-900">{gap.title}</p>
                  <p className="mt-1 text-sm text-zinc-700">{gap.reason}</p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {CONFIDENCE_LABEL[gap.confidence] ?? gap.confidence}
                    {gap.occurrences > 1 && ` · ${gap.occurrences} times`}
                  </p>
                  <GapActions gapId={gap.id} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {open && (
          <>
            <section className="mt-10">
              <h2 className="text-sm font-medium text-zinc-900">{open.title}</h2>
              <p className="mt-1 text-sm text-zinc-600">{open.summary}</p>
              <ol className="mt-3 space-y-3">
                {open.changes.map((change, index) => (
                  <li key={change.id} className="rounded-lg border border-zinc-200 p-5">
                    <p className="text-sm font-medium text-zinc-900">
                      {index + 1}. {change.summary}
                      <span className="ml-2 text-xs font-normal text-zinc-500">
                        {CHANGE_LABEL[change.changeType] ?? change.changeType}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-zinc-700">
                      {change.expectedEffect}
                    </p>
                    <p className="mt-2 text-sm text-zinc-600">{change.reasoning}</p>
                  </li>
                ))}
              </ol>
            </section>

            {open.roadmap.length > 0 && (
              <section className="mt-8">
                <h2 className="text-sm font-medium text-zinc-900">
                  If you hire, this order
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Ordered by how often the gap was actually hit, not by how
                  useful the role sounds.
                </p>
                <ol className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                  {open.roadmap.map((item, index) => (
                    <li key={item.id} className="px-5 py-4">
                      <p className="text-sm font-medium text-zinc-900">
                        {index + 1}. {item.roleName}
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-600">{item.reason}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <EvolutionActions planId={open.id} />
          </>
        )}

        {plan && plan.status !== "recommended" && (
          <p className="mt-8 text-sm text-zinc-500">
            You {plan.status === "approved" ? "accepted" : "set aside"} the last
            plan. A new one appears if the company hits these gaps again.
          </p>
        )}
      </main>
    </div>
  );
}
