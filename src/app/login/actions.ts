"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  // 로그인하면 바로 대화창으로. 대시보드는 무엇을 눌러야 할지 고르는 화면인데,
  // 방금 들어온 사람이 하고 싶은 것은 대개 하나다 — 말을 거는 것.
  redirect("/ask");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
