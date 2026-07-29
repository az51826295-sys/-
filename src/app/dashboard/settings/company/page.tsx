import { redirect } from "next/navigation";
import Link from "next/link";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { NavBar } from "@/components/NavBar";
import { formatInZone } from "@/lib/schedule/time";
import { saveCompanySettings } from "./actions";

/** A short list beats a picker of six hundred zone names. Anything missing can
 *  be reached once the product has customers who need it. */
const COMMON_TIMEZONES = [
  "Asia/Seoul",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "UTC",
];

export default async function CompanySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;

  const company = await getCompanyContext();
  if (!company) redirect("/company/new");

  const zones = COMMON_TIMEZONES.includes(company.timezone)
    ? COMMON_TIMEZONES
    : [company.timezone, ...COMMON_TIMEZONES];

  const { count: scheduleCount } = await company.supabase
    .from("recurring_assignments")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.companyId)
    .in("status", ["active", "paused"]);

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">Company Settings</h1>

        {saved && (
          <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            Settings saved.
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <form action={saveCompanySettings} className="mt-8 flex flex-col gap-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-zinc-900">
              Company Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={company.companyName}
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-zinc-900">
              Time Zone
            </label>
            <select
              id="timezone"
              name="timezone"
              defaultValue={company.timezone}
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-zinc-500">
              Recurring work happens at this local time. It is{" "}
              {formatInZone(new Date(), company.timezone, {
                weekday: undefined,
                month: undefined,
                day: undefined,
              })}{" "}
              there now.
            </p>
            {(scheduleCount ?? 0) > 0 && (
              // Said before saving, because "my Monday 9am job moved" is
              // alarming if it happens without warning.
              <p className="mt-2 text-xs text-zinc-500">
                {scheduleCount} recurring{" "}
                {scheduleCount === 1 ? "assignment keeps" : "assignments keep"} the
                same local time and will be rescheduled against the new zone.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="text-sm text-zinc-600 underline">
              Back to dashboard
            </Link>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Save Settings
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
