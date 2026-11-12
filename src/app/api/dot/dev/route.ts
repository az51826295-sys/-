import { DEV_COOKIE, devKeyOk } from "@/lib/dot/dev";

/**
 * **개발자 링크를 켜고 끄는 문** (11-13).
 *
 *   켜기: `/api/dot/dev?key=<열쇠>`  ·  끄기: `/api/dot/dev?off=1`
 *
 * 켜면 쿠키 하나를 심고 `/dot` 으로 보낸다. 그 쿠키가 있는 브라우저만 하트를 안 센다.
 *
 * 틀린 열쇠에는 **404** 를 준다(401 이 아니라). 401 은 "맞는 열쇠가 있으면 들어올 수 있다"
 * 고 알려 주는 셈이라, 이 주소가 뭔가를 지키고 있다는 것부터 숨긴다.
 *
 * `Secure` 는 https 일 때만 붙인다 — localhost(http)에서 붙이면 브라우저가 쿠키를
 * **조용히 버린다**. 시험이 안 되는데 이유가 안 보이는 자리가 된다.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  const 보낸다 = (cookie: string) =>
    new Response(null, { status: 302, headers: { location: "/dot", "set-cookie": cookie } });

  if (url.searchParams.get("off") === "1") {
    return 보낸다(`${DEV_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
  }

  const key = (url.searchParams.get("key") ?? "").trim();
  if (!devKeyOk(key)) return new Response("Not found", { status: 404 });

  /* 1년. 시험용이라 짧게 둘 까닭이 없고, 끄는 길(`?off=1`)이 따로 있다. */
  return 보낸다(`${DEV_COOKIE}=${encodeURIComponent(key)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
}
