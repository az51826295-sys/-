/**
 * `/robots.txt` — **광고 심사 크롤러가 들어올 수 있게.**
 *
 * 11-10: 광고를 켜려고 보니 이 파일이 **없었다**(404). 없으면 크롤러는 "다 긁어도 된다" 로
 * 보기 때문에 그 자체가 고장은 아니다. 그런데 AdSense 심사는 두 크롤러가 따로 온다:
 *
 *   · `Googlebot`            — 사이트를 읽어 "볼 내용이 있나" 를 본다(승인 심사)
 *   · `Mediapartners-Google` — **광고를 고르려고** 페이지를 읽는다(켜진 뒤 매번)
 *
 * 둘 중 하나라도 막히면 광고가 안 뜨거나(`nofill`) 심사가 안 끝난다. 그래서 **적어 둔다** —
 * 없어서 되는 것과 **적혀서 되는 것**은 다르다(다음에 누가 `Disallow: /` 한 줄을 넣어도
 * 여기 적힌 두 줄이 먼저 읽힌다).
 *
 * `/api` 는 막는다 — 긁을 내용이 아니고, 긁히면 돈(모델 호출)이 나간다.
 */
export const dynamic = "force-dynamic";

const 글 = [
  "User-agent: Mediapartners-Google",
  "Allow: /",
  "",
  "User-agent: Googlebot",
  "Allow: /",
  "",
  "User-agent: *",
  "Allow: /",
  "Disallow: /api/",
  "",
].join("\n");

export function GET(): Response {
  return new Response(글, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
