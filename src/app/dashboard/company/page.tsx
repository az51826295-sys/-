import { redirect } from "next/navigation";
import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { loadCompanyFacts, loadCompanyView } from "@/lib/company/report";
import { timelineLabel } from "@/lib/company/timeline";
import { formatAssignedDate } from "@/lib/assignments/labels";
import { formatUsd } from "@/lib/costs/pricing";
import { healthClass, healthLabel } from "@/lib/intelligence/types";

export default async function CompanyPage() {
  const view = await loadCompanyView();
  if (!view) redirect("/company/new");

  const { companyName, health, report, improvements, timeline, impacts } = view;

  // The four facts a person wants when they open a page called "Company":
  // what it is called, who runs it, how many people work there, and whether
  // anything happened today. Everything below this is the long answer.
  const facts = await loadCompanyFacts();

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{companyName}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              The last {report.days} days, what is outstanding, and how the
              company got here.
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${healthClass[health]}`}
          >
            {healthLabel[health]}
          </span>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Owner", value: facts?.ownerLabel ?? "You" },
            { label: "Employees", value: String(facts?.headcount ?? 0) },
            { label: "Finished in 24h", value: String(facts?.finishedRecently ?? 0) },
            { label: "Spent", value: formatUsd(report.spentUsd) },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-zinc-200 px-4 py-3">
              <dt className="text-xs text-zinc-500">{item.label}</dt>
              <dd className="mt-1 truncate text-xl font-semibold text-zinc-900">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        <dl className="mt-3 grid grid-cols-3 gap-3">
          {[
            { label: "Projects finished", value: String(report.projectsCompleted) },
            { label: "Work approved", value: String(report.deliverablesApproved) },
            { label: "Lessons adopted", value: String(report.learningAdopted) },
            { label: "Method versions", value: String(report.playbookVersions) },
            { label: "Direction changes", value: String(report.organisationChanges) },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-zinc-200 px-4 py-3">
              <dt className="text-xs text-zinc-500">{item.label}</dt>
              <dd className="mt-1 text-xl font-semibold text-zinc-900">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* Settings left the menu bar — it is something you did once, not
            something you do. This is where a person comes when they want to
            change what kind of company this is, so this is where it lives. */}
        <Link
          href="/dashboard/settings/company"
          className="mt-3 inline-block text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          Company settings
        </Link>

        <section className="mt-10">
          <h2 className="text-sm font-medium text-zinc-900">
            Everything waiting on you
          </h2>
          {improvements.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">
              Nothing outstanding. No lesson waiting to be adopted, no method
              change proposed, no department short-handed.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-zinc-500">
                Gathered from everywhere the company raises something. Deciding
                still happens where the evidence is — these link through.
              </p>
              <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                {improvements.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="block px-5 py-4 hover:bg-zinc-50"
                    >
                      <p className="text-sm font-medium text-zinc-900">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-600">{item.detail}</p>
                      <p className="mt-2 text-xs text-zinc-500">{item.category}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {impacts.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-900">
              What changed after you acted
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              The reading taken when you approved, against the company now. What
              it means is your call — plenty else happened in between.
            </p>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {impacts.map((impact, index) => (
                <li
                  key={`${impact.subject}-${index}`}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <span className="text-sm text-zinc-900">{impact.subject}</span>
                  <span className="text-sm text-zinc-600">
                    {impact.before}%
                    {impact.after !== null && ` → ${impact.after}%`}
                    {impact.after === null && " · not measured yet"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* The way in to everything that left the top navigation. Read
            occasionally and deliberately, which is why it belongs on a page
            somebody chose to open rather than on every screen. */}
        <section className="mt-10">
          <h2 className="text-sm font-medium text-zinc-900">Everything else</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              {
                href: "/dashboard/organization",
                title: "Organization",
                blurb: "Departments and who is in them.",
              },
              {
                href: "/dashboard/capacity",
                title: "Where everyone is",
                blurb: "Who can take work right now.",
              },
              {
                href: "/dashboard/intelligence",
                title: "How it is running",
                blurb: "What is backed up, and what to do about it.",
              },
              {
                href: "/dashboard/planning",
                title: "Planning",
                blurb: "Ways through a shortage, hiring last.",
              },
              {
                href: "/dashboard/evolution",
                title: "Evolution",
                blurb: "Work you need and have nobody for.",
              },
              {
                href: "/dashboard/playbooks",
                title: "Playbooks",
                blurb: "How this company does each kind of work.",
              },
              {
                href: "/dashboard/policies",
                title: "Standards",
                blurb: "What every result has to be true of.",
              },
              {
                href: "/dashboard/learning",
                title: "Company Brain",
                blurb: "What the company knows, and what it has just learned.",
              },
              {
                href: "/dashboard/projects",
                title: "Projects",
                blurb: "Goals that take more than one person.",
              },
              {
                href: "/dashboard/operations",
                title: "Operations",
                blurb: "The period the company is working through.",
              },
              {
                href: "/dashboard/recurring-assignments",
                title: "Recurring work",
                blurb: "Work that happens on a schedule.",
              },
              {
                href: "/dashboard/initiatives",
                title: "Recommendations",
                blurb: "Things your employees noticed on their own.",
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border border-zinc-200 px-5 py-4 hover:bg-zinc-50"
              >
                <p className="text-sm font-medium text-zinc-900">{item.title}</p>
                <p className="mt-0.5 text-sm text-zinc-600">{item.blurb}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium text-zinc-900">How you got here</h2>
          {timeline.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">
              Nothing yet. Hire somebody and this fills itself in.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {timeline.map((event, index) => (
                <li
                  key={`${event.at}-${index}`}
                  className="flex items-start justify-between gap-4 border-l-2 border-zinc-200 pl-4"
                >
                  <div>
                    <p className="text-sm text-zinc-900">{event.summary}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {timelineLabel[event.type]}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-zinc-500">
                    {formatAssignedDate(event.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
