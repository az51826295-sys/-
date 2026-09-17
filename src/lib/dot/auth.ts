import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";

/**
 * 도트 채팅을 부른 사람이 누구인가.
 *
 * 로키 웹은 쿠키로 로그인하지만 **안드로이드 앱은 쿠키를 안 쓴다** — 네이티브 앱은
 * 토큰을 자기가 들고 있다가 헤더에 붙인다. 두 경로가 같은 API 를 부르므로 여기서
 * 둘 다 받는다. 이걸 안 해 두면 앱을 붙일 때 API 를 통째로 한 벌 더 짓게 된다.
 *
 * 토큰은 **검증한다.** 몸통에 실려 온 user_id 를 믿으면 아무나 남의 친밀도를
 * 읽는다 — Supabase 에 물어서 그 토큰이 진짜 누구인지 받아 온다.
 */
export async function userIdFrom(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";

  if (token) {
    const anon = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await anon.auth.getUser(token);
    return data.user?.id ?? null;
  }

  const cookieClient = await createCookieClient();
  const { data } = await cookieClient.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * 그 사람으로 행동하는 클라이언트 — 계정 연결처럼 **본인 세션이 필요한** 일에 쓴다(82회차: Bearer 로 오면 401 이었다).
 * Bearer 면 토큰을 헤더에 실은 클라이언트, 아니면 쿠키 클라이언트.
 */
export async function clientAs(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (token) {
    const c = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data } = await c.auth.getUser(token);
    return { client: c, user: data.user ?? null };
  }
  const c = await createCookieClient();
  const { data } = await c.auth.getUser();
  return { client: c, user: data.user ?? null };
}
