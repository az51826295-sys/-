/**
 * 광고용 **진짜 화면** 찍기 (144회차 09-16).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ad_capture.mts <저장폴더>
 *
 * 사장님: *"영상을 쓰레기같이 만들었네 광고가 장난이야?"* — 맞는 말이다.
 * 143회차에 낸 것은 **글자 카드 다섯 장**이었다. 제품이 뭘 하는지 **말로 설명만** 하고 하는 걸 안 보여 준다.
 * 그 배관은 09-09 에 '설명 영상' 용으로 정한 것이고(생성 그림을 빼고 글자만), **광고에 맞는 결정이 아니었다.**
 * 검사 열 개도 전부 형식만 잰다 — 길이·장면 수·자막 수. **"보고 써보고 싶어지나" 를 재는 자는 하나도 없다.**
 * 그래서 7/9 를 받고도 쓰레기다.
 *
 * 광고는 말하는 게 아니라 **보여주는 것**이다. 여기서 찍는 것은 지어낸 화면이 아니라
 * **진짜 계정으로 진짜 주문을 넣고 진짜 파일이 나오는** 장면이다.
 *
 * 엣지를 헤드리스로 띄운다(puppeteer-core). 로그인은 폼을 누르지 않고 **세션 쿠키**를 심는다 —
 * 합성 클릭이 React 에 안 잡히는 것을 확인했다(로그인 자체는 멀쩡하다, `btn.click()` 으로 확인).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const OUT = process.argv[2];
if (!OUT) { console.error("저장 폴더를 달라"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const SITE = process.env.ROOKERY_SITE ?? "https://rookery-web-production.up.railway.app";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const EMAIL = "demo-rookery@rookery.local";
const PASSWORD = "Rookery-Demo-2026!aA";
const ORDER = "기후변화가 농업에 미치는 영향 60초 설명 영상 만들어 줘";

const { createClient } = await import("@supabase/supabase-js");
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = createClient(SUPA, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const { data: sess, error: sErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (sErr || !sess.session) { console.error("로그인 실패:", sErr?.message); process.exit(1); }
const s = sess.session;
const ref = new globalThis.URL(SUPA).hostname.split(".")[0];
const cookieValue =
  "base64-" +
  Buffer.from(JSON.stringify({
    access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at,
    expires_in: s.expires_in, token_type: s.token_type, user: s.user,
  })).toString("base64url");
console.log("세션 받음");

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,800", "--force-device-scale-factor=1", "--lang=ko-KR"],
  defaultViewport: { width: 1280, height: 800 },
});
try {
  const page = await browser.newPage();
  const host = new globalThis.URL(SITE).hostname;
  await page.setCookie({ name: `sb-${ref}-auth-token`, value: cookieValue, domain: host, path: "/", httpOnly: false, secure: true });

  let n = 0;
  const shot = async (name: string) => {
    const p = `${OUT}/${String(++n).padStart(2, "0")}_${name}.png`;
    await page.screenshot({ path: p as `${string}.png` });
    console.log(`  찍음 ${p}`);
    return p;
  };

  // ① 빈 대화창 — 여기서 시작한다
  await page.goto(`${SITE}/ask`, { waitUntil: "networkidle2", timeout: 120_000 });
  await new Promise((r) => setTimeout(r, 3000));
  await shot("빈화면");

  // ② 주문을 친다 — 광고의 후크는 이 한 문장이다
  const box = await page.waitForSelector('textarea, input[placeholder*="물어"]', { timeout: 30_000 });
  await box!.click();
  await page.keyboard.type(ORDER, { delay: 45 });
  await new Promise((r) => setTimeout(r, 800));
  await shot("주문침");

  // ③ 보낸다 — 진짜로 일이 시작된다
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "보내기");
    (b as HTMLButtonElement | undefined)?.click();
  });
  await new Promise((r) => setTimeout(r, 12_000));
  await shot("받는중");

  // ④ 일이 도는 동안 — 상태가 대화에 흐른다
  for (const wait of [45_000, 60_000, 60_000]) {
    await new Promise((r) => setTimeout(r, wait));
    await shot("도는중");
  }

  // ⑤ 결과가 붙을 때까지 (최대 7분 더)
  for (let i = 0; i < 14; i++) {
    await new Promise((r) => setTimeout(r, 30_000));
    const done = await page.evaluate(() => /mp4|영상 \(mp4\)|검사 결과/.test(document.body.innerText));
    if (done) { await shot("결과나옴"); break; }
    if (i === 13) { await shot("아직"); console.log("  (결과를 못 기다림)"); }
  }
  await new Promise((r) => setTimeout(r, 2000));
  await shot("끝화면");
  console.log(`\n${n}장 찍음 → ${OUT}`);
} finally {
  await browser.close();
}
