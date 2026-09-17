"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase 는 영어로 준다. 흔한 둘만 우리말로 — 나머지는 원문 그대로(숨기지 않는다).
    const why = /invalid login credentials/i.test(error.message) ? "이메일이나 비밀번호가 맞지 않아요."
      : /email not confirmed/i.test(error.message) ? "메일함에서 확인 링크를 먼저 눌러 주세요."
      : error.message;
    redirect("/login?error=" + encodeURIComponent(why));
  }

  // 로그인하면 바로 대화창으로. 대시보드는 무엇을 눌러야 할지 고르는 화면인데,
  // 방금 들어온 사람이 하고 싶은 것은 대개 하나다 — 말을 거는 것.
  redirect(process.env.PRODUCT === "dot" ? "/dot" : "/ask");
}

/**
 * 구글로 들어가기. Supabase 가 구글 동의 화면 주소를 주면 거기로 보낸다; 끝나면 /auth/callback 으로 돌아온다.
 * 구글 쪽 열쇠(클라이언트 ID·시크릿)가 Supabase Auth 에 등록돼 있어야 한다 — 없으면 Supabase 가 오류를 준다.
 */
export async function googleLogin(formData: FormData) {
  const origin = String(formData.get("origin") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data.url) redirect("/login?error=" + encodeURIComponent(error?.message ?? "구글 로그인 주소를 못 받았어요."));
  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
