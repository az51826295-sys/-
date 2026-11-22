"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * 이메일로 들어오기 — 09-28 이전에 이메일·비밀번호로 계정을 만든 사람들(13명)의 문.
 * 새로 만드는 길은 없다(가입은 구글만). 틀리면 **이유를 붙여** 이 화면으로 돌아온다.
 */
export async function dotEmailLogin(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/dot/login?error=" + encodeURIComponent("이메일과 비밀번호를 모두 적어 주세요."));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const why = /invalid login credentials/i.test(error.message) ? "이메일이나 비밀번호가 맞지 않아요."
      : /email not confirmed/i.test(error.message) ? "메일함에서 확인 링크를 먼저 눌러 주세요."
      : error.message;
    redirect("/dot/login?error=" + encodeURIComponent(why));
  }
  redirect("/dot/feed");
}
