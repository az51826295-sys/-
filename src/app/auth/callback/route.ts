import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/http/origin";
import { AUTH_NEXT_COOKIE, safeNext } from "@/lib/dot/authNext";

/**
 * OAuth 돌아오는 자리(구글 로그인·구글 연결). 구글이 `?code=` 를 붙여 여기로 보내면 세션으로 바꾸고 앱으로 보낸다.
 *
 * Supabase 대시보드(또는 Management API)의 Redirect URLs 에 이 주소가 등록돼 있어야 한다:
 *   https://<도메인>/auth/callback
 * 실패하면 로그인 화면으로 돌려보내되 **이유를 붙인다** — 조용히 로그인 화면만 다시 뜨면 사람은 자기가 뭘 잘못한 줄 안다.
 *
 * 11-22: 두근도트는 로그인 화면이 `/dot/login` 이다(`/login` 은 앱 안으로 돌려보낸다). 구글이 `error_code` 를
 * 붙여 돌려보내면(예: 이 구글 계정이 이미 다른 두근도트 계정에 붙어 있다 = `identity_already_exists`)
 * 그 코드를 그대로 로그인 화면에 넘긴다 — 화면이 그걸 보고 **그 계정으로 로그인**을 이어서 한다.
 * 갈 곳은 쿠키(`dot_auth_next`)로 받는다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicOrigin(request);   // request.url 은 프록시 뒤에서 localhost:8080 이다(97회차)
  const dot = process.env.PRODUCT === "dot";
  const jar = await cookies();
  const next = safeNext(jar.get(AUTH_NEXT_COOKIE)?.value);
  const home = dot ? (next ?? "/dot") : "/ask";
  const loginPage = dot ? "/dot/login" : "/login";

  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, origin));
    if (next) res.cookies.delete(AUTH_NEXT_COOKIE);
    return res;
  };

  const code = url.searchParams.get("code");
  if (!code) {
    const errCode = url.searchParams.get("error_code") ?? "";
    const why = url.searchParams.get("error_description") ?? "구글에서 돌아온 값이 없어요.";
    return go(`${loginPage}?${errCode ? `error_code=${encodeURIComponent(errCode)}&` : ""}error=${encodeURIComponent(why)}`);
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return go(`${loginPage}?error=${encodeURIComponent(error.message)}`);
  return go(home);
}
