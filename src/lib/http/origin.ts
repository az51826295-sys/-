/**
 * 바깥에서 보이는 주소(origin) — 97회차 09-13 검수에서 잡은 것.
 * Railway 뒤에서는 `request.url` 이 `https://localhost:8080/...` 이라, 이걸로 redirect 를 만들면
 * 구글 로그인 돌아오기·이메일 링크·로그아웃 뒤가 전부 localhost 로 튕긴다(실서버 curl 로 확인).
 * 프록시가 붙여 주는 x-forwarded-* 를 먼저 보고, 없으면 host, 그것도 없으면 request.url.
 */
export function publicOrigin(request: Request): string {
  return publicOriginFromHeaders(request.headers) ?? new URL(request.url).origin;
}

/**
 * **머리글만 있을 때** (228회차 10-03). 서버 컴포넌트에는 `Request` 가 없고 `headers()` 뿐이다.
 *
 * 10-03 에 로그인 화면에서 구글 단추를 붙이며 `host` 만 보고 주소를 손으로 조립했다가,
 * 폰에서 **localhost 로 튕겼다** — 97회차에 이미 한 번 잡은 바로 그 고장이다.
 * 고친 자리가 있는데 안 쓰고 다시 조립하면 같은 고장이 다시 난다. **한 곳에서만 만든다.**
 */
export function publicOriginFromHeaders(h: Headers): string | null {
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}
