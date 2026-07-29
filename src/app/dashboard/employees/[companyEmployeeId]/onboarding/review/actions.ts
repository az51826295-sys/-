"use server";

import { redirect } from "next/navigation";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { completeOnboarding } from "@/lib/onboarding/service";

export async function completeOnboardingAction(formData: FormData) {
  const companyEmployeeId = String(formData.get("companyEmployeeId") ?? "");
  const owned = await getOwnedCompanyEmployee(companyEmployeeId);

  if (!owned) {
    redirect("/dashboard");
  }

  const result = await completeOnboarding(owned);

  if ("error" in result) {
    redirect(
      `/dashboard/employees/${companyEmployeeId}/onboarding/review?error=` +
        encodeURIComponent(result.error),
    );
  }

  redirect(`/dashboard/employees/${companyEmployeeId}?completed=1`);
}
