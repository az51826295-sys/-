"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { applyCompanyTimezone } from "@/lib/recurring/service";
import { isValidTimeZone } from "@/lib/schedule/time";

export async function saveCompanySettings(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();

  const company = await getCompanyContext();
  if (!company) redirect("/login");

  if (name.length < 2) {
    redirect("/dashboard/settings/company?error=" + encodeURIComponent("Give your company a name."));
  }
  if (!isValidTimeZone(timezone)) {
    redirect(
      "/dashboard/settings/company?error=" + encodeURIComponent("Choose a valid time zone."),
    );
  }

  await company.supabase
    .from("companies")
    .update({ name, timezone })
    .eq("id", company.companyId);

  // Schedules keep the wall-clock time the manager chose — "every Monday at
  // 9am" stays 9am — so every next run has to be recomputed against the new
  // zone. Doing it here rather than lazily means the dashboard never shows a
  // stale time.
  if (timezone !== company.timezone) {
    await applyCompanyTimezone(company.companyId, timezone);
  }

  revalidatePath("/dashboard/settings/company");
  revalidatePath("/dashboard");
  redirect("/dashboard/settings/company?saved=1");
}
