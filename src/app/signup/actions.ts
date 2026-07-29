"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/signup?error=" + encodeURIComponent("Email and password are required."));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect("/signup?error=" + encodeURIComponent(error.message));
  }

  if (!data.session) {
    // Email confirmation is required before a session exists.
    redirect("/login?message=" + encodeURIComponent("Check your email to confirm your account, then log in."));
  }

  redirect("/company/new");
}
