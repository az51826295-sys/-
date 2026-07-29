"use server";

import { redirect } from "next/navigation";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { startOnboarding } from "@/lib/onboarding/service";

export async function startOnboardingAction(formData: FormData) {
  const companyEmployeeId = String(formData.get("companyEmployeeId") ?? "");
  const owned = await getOwnedCompanyEmployee(companyEmployeeId);

  if (!owned) {
    redirect("/dashboard");
  }

  await startOnboarding(owned);
  redirect(`/dashboard/employees/${companyEmployeeId}/onboarding`);
}
