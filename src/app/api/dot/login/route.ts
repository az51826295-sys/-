import { createClient } from "@/lib/supabase/server";
import { 구글켜졌나, 구글꺼짐말 } from "@/lib/auth/googleEnabled";
import { publicOrigin } from "@/lib/http/origin";
import { AUTH_NEXT_COOKIE } from "@/lib/dot/authNext";

/**
 * **두근도트 로그인 — 구글 한 단추** (11-22 사장님 "로그인창도 따로").
 *
 * 누르는 사람은 셋 중 하나다:
 *  1. **손님(익명)으로 이미 대화한 사람** → 지금 계정에 구글을 **붙인다**(`linkIdentity`). 대화·친밀도·하트가 그대로 남는다.
 *  2. 그 구글 계정이 **이미 다른 두근도트 계정**에 붙어 있으면 구글이 `identity_already_exists` 로 돌려보낸다 →
 *     로그인 화면이 `mode: "signin"` 으로 다시 부른다 → 그 계정으로 **로그인**(이 기기의 손님 대화는 손님 계정에 남는다).
 *  3. 아무 계정도 없는 사람 → 바로 로그인(`signInWithOAuth`).
 *
 * 돌아오는 자리는 `/auth/callback` 하나(구글 허용 목록), 갈 곳은 쿠키로.
 */
export async function POST(request: Request) {
  const { 켜짐 } = await 구글켜졌나();
  if (!켜짐) return Response.json({ error: 구글꺼짐말 }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { mode?: string };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const redirectTo = `${publicOrigin(request)}/auth/callback`;

  const 붙이기 = body.mode !== "signin" && !!user && !!user.is_anonymous;
  const r = 붙이기
    ? await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo } })
    : await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if (r.error || !r.data?.url) {
    return Response.json({ error: r.error?.message ?? "구글 로그인 주소를 못 받았어요." }, { status: 400 });
  }
  const res = Response.json({ url: r.data.url });
  const next = 붙이기 ? "/dot/login?linked=1" : "/dot/feed";
  res.headers.append("set-cookie", `${AUTH_NEXT_COOKIE}=${encodeURIComponent(next)}; Path=/; Max-Age=900; SameSite=Lax; Secure`);
  return res;
}
