/**
 * # `/ads.txt` — **광고주 번호를 사이트가 직접 밝힌다**  (11-10)
 *
 * AdSense 는 사이트 뿌리의 `ads.txt` 로 *"이 사이트의 광고를 팔 권한이 누구에게 있나"* 를 본다.
 * 없으면 계정 화면에 **"수익이 위험합니다"** 가 뜨고, 광고가 덜 붙거나 안 붙는다.
 * 사이트 소유 확인(verification)도 이 파일로 받아 준다 — 그래서 **계정만 만들면 끝나도록**
 * 미리 깔아 둔다. 형(계정 주인)이 할 일을 한 칸 줄이는 자리다.
 *
 * 번호는 환경변수에서 읽는다(`ADSENSE_CLIENT=ca-pub-…`). 코드에 박지 않는 까닭은
 * `money.ts` 의 `adConfFromEnv()` 에 적어 둔 것과 같다 — 번호를 바꾸려고 다시 빌드하지 않는다.
 * 번호가 없으면 **빈 파일 대신 404** 다: 빈 ads.txt 는 "아무도 권한이 없다"는 뜻이라
 * 있는 것보다 나쁘다.
 */
export const dynamic = "force-dynamic";

/** 구글 광고 거래소의 고정 인증자 id — 모든 AdSense ads.txt 가 같은 값을 쓴다. */
const GOOGLE_TAG = "f08c47fec0942fa0";

export function GET(): Response {
  const client = (process.env.ADSENSE_CLIENT ?? "").trim();
  if (!/^ca-pub-\d{10,22}$/.test(client)) {
    return new Response("ads.txt not configured", { status: 404 });
  }
  const pub = client.replace(/^ca-/, "");   // ads.txt 는 `pub-…` 로 적는다(`ca-` 를 뗀다)
  return new Response(`google.com, ${pub}, DIRECT, ${GOOGLE_TAG}\n`, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
