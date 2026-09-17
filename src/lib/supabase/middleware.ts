import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * `requireLogin` — 세션이 없으면 로그인 화면으로 보낸다(09-11 사장님: 익명 대신 "처음 시작할 때 로그인으로").
 * 익명 계정은 잠깐 있었다(17:34~17:5x) — 폰을 바꾸면 다 잃는 문제가 결제(멘헤라 모드 유료)와 맞지 않아 되돌렸다.
 */
export async function updateSession(request: NextRequest, opts: { requireLogin?: boolean } = {}) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user && opts.requireLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login"; url.search = "";
    return NextResponse.redirect(url);
  }

  // 09-05: 로그인이 있어야 열리는 화면이 없어졌다. /ask 는 로그인 없이 열리고,
  // 로그인은 "이어서 하시려면" 이다. 세션 갱신만 남긴다.
  void user;

  return supabaseResponse;
}
