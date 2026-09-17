/**
 * 광고의 **결정적 장면** 찍기 — 파일이 나온 화면 (144회차 09-16).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ad_capture2.mts <저장폴더>
 *
 * 1차(`ad_capture.mts`)는 주문·고용·착수까지 찍었는데 **파일이 나오는 순간을 놓쳤다** — 아직 만드는 중이었다.
 * 광고에서 제일 중요한 한 장이 그거다. 일이 끝난 지금 다시 가서 찍는다:
 *   · 결과가 붙은 대화(mp4·자막·대본 표·검사 결과)
 *   · 오른쪽 미리보기(검사 통과 줄, 버전, 승인/수정 단추)
 */
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const OUT = process.argv[2];
if (!OUT) { console.error("저장 폴더를 달라"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const SITE = process.env.ROOKERY_SITE ?? "https://rookery-web-production.up.railway.app";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const { createClient } = await import("@supabase/supabase-js");
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = createClient(SUPA, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const { data: sess } = await anon.auth.signInWithPassword({ email: "demo-rookery@rookery.local", password: "Rookery-Demo-2026!aA" });
const s = sess!.session!;
const ref = new globalThis.URL(SUPA).hostname.split(".")[0];
const cookieValue = "base64-" + Buffer.from(JSON.stringify({
  access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at,
  expires_in: s.expires_in, token_type: s.token_type, user: s.user,
})).toString("base64url");

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=1", "--lang=ko-KR"],
  defaultViewport: { width: 1280, height: 800 },
});
try {
  const page = await browser.newPage();
  await page.setCookie({ name: `sb-${ref}-auth-token`, value: cookieValue, domain: new globalThis.URL(SITE).hostname, path: "/", secure: true });
  const CONV = process.argv[3] ?? "";
  await page.goto(CONV ? `${SITE}/ask?c=${CONV}` : `${SITE}/ask`, { waitUntil: "networkidle2", timeout: 120_000 });

  // 결과 턴이 붙을 때까지(폴링이 6초마다 돈다)
  for (let i = 0; i < 20; i++) {
    const has = await page.evaluate(() => /영상 \(mp4\)|검사 결과|자막 \(SRT\)/.test(document.body.innerText));
    if (has) break;
    await new Promise((r) => setTimeout(r, 6000));
  }
  await new Promise((r) => setTimeout(r, 3000));

  let n = 20;
  const shot = async (name: string) => {
    const p = `${OUT}/${++n}_${name}.png`;
    await page.screenshot({ path: p as `${string}.png` });
    console.log(`  찍음 ${p}`);
  };

  await shot("결과붙음");
  // 맨 아래로 — 파일 목록과 검사 결과가 보이게
  await page.evaluate(() => { const el = document.scrollingElement || document.body; el.scrollTop = el.scrollHeight; window.scrollTo(0, document.body.scrollHeight); });
  await new Promise((r) => setTimeout(r, 1500));
  await shot("파일과검사");
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  console.log("\n화면에 보이는 것:\n" + txt);
} finally {
  await browser.close();
}
