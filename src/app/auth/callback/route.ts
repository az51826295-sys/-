import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/http/origin";

/**
 * OAuth 돌아오는 자리(구글 로그인). 구글이 `?code=` 를 붙여 여기로 보내면 세션으로 바꾸고 앱으로 보낸다.
 *
 * Supabase 대시보드(또는 Management API)의 Redirect URLs 에 이 주소가 등록돼 있어야 한다:
 *   https://<도메인>/auth/callback
 * 실패하면 로그인 화면으로 돌려보내되 **이유를 붙인다** — 조용히 로그인 화면만 다시 뜨면 사람은 자기가 뭘 잘못한 줄 안다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicOrigin(request);   // request.url 은 프록시 뒤에서 localhost:8080 이다(97회차)
  const code = url.searchParams.get("code");
  const home = process.env.PRODUCT === "dot" ? "/dot" : "/ask";
  if (!code) return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent("구글에서 돌아온 값이 없어요."), origin));
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent(error.message), origin));
  return NextResponse.redirect(new URL(home, origin));
}
