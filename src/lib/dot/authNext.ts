/**
 * 구글에서 돌아온 뒤 **어디로 갈지** (11-22). 돌아오는 주소(/auth/callback)에 꼬리를 붙이면
 * Supabase 허용 목록과 안 맞아 엉뚱한 곳(Site URL)으로 튈 수 있어서, 가는 곳은 쿠키로 들고 간다.
 * `/dot` 로 시작하는 앱 안 주소만 받는다(바깥으로 튕기는 문이 되면 안 된다).
 */
export const AUTH_NEXT_COOKIE = "dot_auth_next";
export function safeNext(v: string | undefined | null): string | null {
  const s = decodeURIComponent(v ?? "");
  return /^\/dot(\/|\?|$)/.test(s) && !s.includes("//") ? s : null;
}
