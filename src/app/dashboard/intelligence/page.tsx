import { redirect } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { loadIntelligence } from "@/lib/intelligence/service";
import {
  healthClass,
  healthLabel,
  insightCategoryLabel,
  recommendationCategoryLabel,
  recommendationStatusLabel,
  severityClass,
  severityLabel,
} from "@/lib/intelligence/types";
import { RecommendationActions } from "./RecommendationActions";

export default async function IntelligencePage() {
  const intelligence = await loadIntelligence();
  if (!intelligence) redirect("/company/new");

  const { health, insights, recommendations } = intelligence;
  const open = recommendations.filter((row) => row.status === "new");
  const decided = recommendations.filter((row) => row.status !== "new");

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              How the company is running
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Counted from work that has already happened. Reading this costs
              nothing, so it is worked out fresh every time you open it.
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${healthClass[health]}`}
          >
            {healthLabel[health]}
          </span>
        </div>

        {open.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-medium text-zinc-900">
              What I&apos;d do about it
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Cheapest first. Hiring is last because it is the only one that
              costs money every month afterwards.
            </p>
            <ul className="mt-3 space-y-3">
              {open.map((recommendation) => (
                <li
                  key={recommendation.id}
                  className="rounded-lg border border-zinc-200 p-5"
                >
                  <p className="text-sm font-medium text-zinc-900">
                    {recommendation.title}
                  </p>
                  <p className="mt-1 text-sm text-zinc-700">
                    {recommendation.description}
                  </p>
                  <p className="mt-2 text-sm text-zinc-600">
                    {recommendation.reasoning}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {recommendationCategoryLabel[recommendation.category]}
                  </p>
                  <RecommendationActions
                    recommendationId={recommendation.id}
                    action={recommendation.action}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-sm font-medium text-zinc-900">What I can see</h2>
          {insights.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">
              Nothing stands out. That is a real answer — it means no department
              is backed up, nothing is waiting on you, and work is not coming
              back for changes.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {insights.map((insight) => (
                <li
                  key={insight.id}
                  className="rounded-lg border border-zinc-200 px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        {insight.title}
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-600">
                        {insight.summary}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">
                        {insightCategoryLabel[insight.category]}
                        {Object.entries(insight.measurements).length > 0 && (
                          <>
                            {" · "}
                            {Object.entries(insight.measurements)
                              .map(([key, value]) => `${humanise(key)} ${value}`)
                              .join(", ")}
                          </>
                        )}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${severityClass[insight.severity]}`}
                    >
                      {severityLabel[insight.severity]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {decided.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-900">Already decided</h2>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {decided.map((recommendation) => (
                <li
                  key={recommendation.id}
                  className="flex items-start justify-between gap-4 px-5 py-3"
                >
                  <p className="text-sm text-zinc-900">{recommendation.title}</p>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {recommendationStatusLabel[recommendation.status]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

/** Measurement keys are written for the code; this makes them readable without
 *  keeping a second label table in step with the detectors. */
function humanise(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .toLowerCase()
    .trim();
}
