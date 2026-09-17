import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/http/origin";

/**
 * 이메일 링크(매직 링크·가입 확인)로 돌아오는 자리 (97회차 09-13).
 * Supabase 가 만든 `token_hash` 를 세션으로 바꾸고 앱으로 보낸다. 비밀번호를 치지 않는 로그인 길.
 *   /auth/confirm?token_hash=…&type=magiclink|signup|recovery|email
 * 검수(dot_qa_session.mts --link)도 이 길로 들어온다 — 비밀번호를 화면에 치지 않기 위해.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicOrigin(request);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as "magiclink" | "signup" | "recovery" | "email" | null;
  const home = process.env.PRODUCT === "dot" ? "/dot" : "/ask";
  if (!tokenHash || !type) return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent("링크에 확인값이 없어요."), origin));
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent("링크가 만료됐거나 이미 썼어요. 다시 로그인해 주세요."), origin));
  return NextResponse.redirect(new URL(home, origin));
}
