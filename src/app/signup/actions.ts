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

  // 가입 직후에도 대화창으로. 회사 만들기는 회사 모드를 쓸 때 필요해지는 것이지
  // 들어오자마자 요구할 것이 아니다 — 값어치를 보기 전에 서식부터 내밀면
  // 대부분 거기서 닫는다.
  redirect("/ask");
}
