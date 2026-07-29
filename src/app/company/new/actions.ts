"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createCompany(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();

  if (!name) {
    redirect("/company/new?error=" + encodeURIComponent("Company name is required."));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (existing) {
    redirect("/employees");
  }

  const { error } = await supabase.from("companies").insert({
    owner_id: user.id,
    name,
    website: website || null,
  });

  if (error) {
    redirect("/company/new?error=" + encodeURIComponent(error.message));
  }

  redirect("/employees");
}
