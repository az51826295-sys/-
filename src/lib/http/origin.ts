/**
 * 바깥에서 보이는 주소(origin) — 97회차 09-13 검수에서 잡은 것.
 * Railway 뒤에서는 `request.url` 이 `https://localhost:8080/...` 이라, 이걸로 redirect 를 만들면
 * 구글 로그인 돌아오기·이메일 링크·로그아웃 뒤가 전부 localhost 로 튕긴다(실서버 curl 로 확인).
 * 프록시가 붙여 주는 x-forwarded-* 를 먼저 보고, 없으면 host, 그것도 없으면 request.url.
 */
export function publicOrigin(request: Request): string {
  const h = request.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return new URL(request.url).origin;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}
