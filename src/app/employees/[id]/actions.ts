"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function hireEmployee(formData: FormData) {
  const employeeId = String(formData.get("employeeId") ?? "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!company) {
    redirect("/company/new");
  }

  const { data: hired } = await supabase
    .from("company_employees")
    .insert({
      company_id: company.id,
      employee_id: employeeId,
    })
    .select("id")
    .maybeSingle();

  // Straight to training rather than back to the dashboard.
  //
  // Somebody who has just hired their first employee has exactly one thing to
  // do next, and it is the same thing every time — the new hire cannot take any
  // work until they have been told about the company. Returning to a dashboard
  // to find that out is a detour through a screen they have no use for yet.
  if (hired) redirect(`/dashboard/employees/${hired.id as string}`);

  redirect("/dashboard");
}
