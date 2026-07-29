import { redirect } from "next/navigation";
import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { loadPlanning } from "@/lib/planning/service";
import { PlanOptions } from "./PlanOptions";

export default async function PlanningPage() {
  const planning = await loadPlanning();
  if (!planning) redirect("/company/new");

  const { reading, plans } = planning;
  const open = plans.filter((plan) => plan.status === "recommended");
  const decided = plans.filter((plan) => plan.status !== "recommended");

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">Planning</h1>
        <p className="mt-1 text-sm text-zinc-500">
          What the company could do about the load it has and the load coming.
          Each plan offers alternatives — you pick one.
        </p>

        <dl className="mt-6 grid grid-cols-3 gap-3">
          {[
            { label: "At capacity", value: reading.overCapacity.length },
            {
              label: "People free",
              value: reading.employees.filter((e) => e.state === "free").length,
            },
            { label: "Plans waiting", value: open.length },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-zinc-200 px-4 py-3">
              <dt className="text-xs text-zinc-500">{item.label}</dt>
              <dd className="mt-1 text-xl font-semibold text-zinc-900">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        {open.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-600">
            No department is short-handed. Nothing is queued behind somebody with
            nobody free to help, and nothing scheduled is heading somewhere that
            cannot take it.{" "}
            <Link href="/dashboard/capacity" className="underline">
              See where everyone is
            </Link>
            .
          </p>
        ) : (
          <div className="mt-8 space-y-6">
            {open.map((plan) => (
              <section key={plan.id} className="rounded-lg border border-zinc-200 p-6">
                <h2 className="text-sm font-medium text-zinc-900">{plan.title}</h2>
                <p className="mt-1 text-sm text-zinc-600">{plan.summary}</p>
                <PlanOptions planId={plan.id} options={plan.options} />
              </section>
            ))}
          </div>
        )}

        {decided.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-900">Already decided</h2>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {decided.map((plan) => {
                const chosen = plan.options.find(
                  (option) => option.id === plan.chosenOptionId,
                );
                return (
                  <li key={plan.id} className="px-5 py-3">
                    <p className="text-sm text-zinc-900">{plan.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {plan.status === "dismissed"
                        ? "Turned down"
                        : chosen
                          ? `You chose: ${chosen.summary}`
                          : "Decided"}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="mt-8">
          <Link href="/dashboard/capacity" className="text-sm text-zinc-600 underline">
            Where everyone is
          </Link>
        </div>
      </main>
    </div>
  );
}
