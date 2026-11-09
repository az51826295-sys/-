/**
 * # 놀이를 **방에서 눌러** 본다 (11-09)
 *
 *   npm run dev 를 띄우고: npx tsx engine/tools/dot_game_shot.mts
 *
 * 시험 계정으로 들어가 입력줄의 놀이 단추 → 끝말잇기 → 한 수까지 **실제로 누른다.**
 * 재는 것: 놀이 판이 그려지나 · 고르면 판이 열리나 · 띠가 뜨나 · 한 수가 들어가나 · 가로 넘침.
 */
import { readFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
import puppeteer from "puppeteer-core";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { todayKST, CHECKIN_HEARTS } = await import("../../src/lib/dot/bond");

const BASE = process.env.DOT_BASE ?? "http://localhost:3000";
const OUT = "C:/Users/az518/Desktop/로키-도트/놀이-20261109";
mkdirSync(OUT, { recursive: true });
const db = createServiceClient();
const { data: c } = await db.from("dot_characters").select("id, slug, name").eq("slug", "rin").single();

const 메일 = `gameshot-${Date.now()}@dugeun.local`;
const { data: 만든것, error: e1 } = await db.auth.admin.createUser({ email: 메일, password: `t-${Math.random().toString(36).slice(2)}!`, email_confirm: true });
if (e1 || !만든것?.user) { console.error(`시험 계정을 못 만들었다: ${e1?.message}`); process.exit(1); }
const USER = 만든것.user.id;
await db.from("dot_usage").upsert({ user_id: USER, day: todayKST(), turns: 0, bonus_turns: CHECKIN_HEARTS, ad_refills: 0 }, { onConflict: "user_id,day" });
await db.from("dot_wallet").upsert({ user_id: USER, credits: 40 }, { onConflict: "user_id" });

const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email: 메일 });
const browser = await puppeteer.launch({
  executablePath: process.env.DOT_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, userDataDir: `${process.env.TEMP}/rk-hl-game-${process.pid}`, args: ["--no-first-run", "--lang=ko-KR"],
});
const 적은것: string[] = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  page.setDefaultNavigationTimeout(180_000);
  await page.goto(`${BASE}/auth/confirm?token_hash=${link!.properties!.hashed_token}&type=magiclink&next=/dot/${c!.slug}`, { waitUntil: "domcontentloaded" });
  await page.goto(`${BASE}/dot/${c!.slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".kk-input-row", { timeout: 120_000 });
  await new Promise((r) => setTimeout(r, 1200));

  /* 화면이 깨어나기 전에는 단추가 전부 막혀 있다(입력칸이 "잠시만요…"). 시간으로 기다리면
     dev 에서 늘 막힌 채로 눌러 놓고 20초를 버린다 — **열렸다는 표시**를 기다린다. */
  await page.waitForSelector('button[aria-label="놀이"]:not([disabled])', { timeout: 120_000 });
  /* "이 방 쓰는 법" 은 **깨어난 뒤에** 깔린다 — 먼저 치우려 하면 아직 없어서 못 치우고,
     나중에 덮여서 단추가 안 눌린다(11-09 에 이걸로 두 번 헛돌았다). */
  for (const b of await page.$$("button")) {
    const t = await page.evaluate((e) => e.textContent ?? "", b);
    if (t.includes("알겠어요")) { await b.click(); break; }
  }
  await new Promise((r) => setTimeout(r, 600));
  const 놀이단추 = await page.$('button[aria-label="놀이"]');
  적은것.push(놀이단추 ? "✅ 놀이 단추가 있다" : "❌ 놀이 단추가 없다");
  if (!놀이단추) throw new Error("놀이 단추 없음");
  /* 막혀 있으면 눌러도 아무 일이 없다 — 그 사실을 먼저 적는다(한참 기다리다 시간만 버렸다). */
  const 막힘 = await page.evaluate((e) => (e as HTMLButtonElement).disabled, 놀이단추);
  적은것.push(막힘 ? "❌ 놀이 단추가 막혀 있다" : "✅ 놀이 단추가 눌린다");
  await page.screenshot({ path: `${OUT}/0-방.png` });
  await 놀이단추.click();
  await page.waitForSelector(".gt-pick", { timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/1-고르기.png` });
  const 칸수 = await page.$$eval(".gt-pick button", (e) => e.length);
  적은것.push(칸수 === 4 ? "✅ 놀이 넷이 보인다" : `❌ 놀이 ${칸수}개만 보인다`);
  const 아이콘 = await page.$$eval(".gt-pick .gt-px i.on", (e) => e.length);
  적은것.push(아이콘 >= 40 ? `✅ 도트 아이콘이 그려진다 (켜진 칸 ${아이콘})` : `❌ 아이콘이 안 그려진다 (${아이콘})`);

  /* 끝말잇기 고르기 */
  for (const b of await page.$$(".gt-pick button")) {
    const t = await page.evaluate((e) => e.textContent ?? "", b);
    if (t.includes("끝말잇기")) { await b.click(); break; }
  }
  await page.waitForSelector(".gt-band", { timeout: 90_000 });
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => { for (const el of document.querySelectorAll("*")) if (el.scrollHeight > el.clientHeight + 8) el.scrollTop = el.scrollHeight; });
  await page.screenshot({ path: `${OUT}/2-판열림.png` });
  적은것.push("✅ 판이 열리고 띠가 뜬다");

  /**
   * 캐릭터가 낸 낱말의 끝 글자로 한 수.
   *
   * 낱말은 **첫 말풍선**이다(서버가 첫 줄에 못 박는다). 처음엔 마지막 말풍선을 읽었는데
   * 그건 한마디("나부터 간다,")라 끝 글자가 쉼표가 됐고, 보낸 수가 규칙에 막혔다.
   * 그런데도 "말풍선 3개" 만 세던 자가 통과를 줬다 — **세는 대상이 틀리면 자가 거짓말을 한다.**
   */
  const 낱말 = await page.$$eval(".kk-bubble.them", (e) => (e[0]?.textContent ?? "").trim());
  const 끝글자 = [...낱말][[...낱말].length - 1] ?? "";
  const 전개수 = await page.$$eval(".kk-bubble", (e) => e.length);
  await page.type(".kk-input-row textarea", `${끝글자}바람`);
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 12000));
  await page.evaluate(() => { for (const el of document.querySelectorAll("*")) if (el.scrollHeight > el.clientHeight + 8) el.scrollTop = el.scrollHeight; });
  await page.screenshot({ path: `${OUT}/3-한수.png` });
  const 후개수 = await page.$$eval(".kk-bubble", (e) => e.length);
  const 내말 = await page.$$eval(".kk-bubble.me", (e) => e.map((x) => x.textContent ?? ""));
  적은것.push(내말.some((s) => s.includes(`${끝글자}바람`)) ? `✅ 내 수가 남아 있다 ("${끝글자}바람")` : `❌ 내 수가 막혔다 (낱말 "${낱말}" → "${끝글자}바람")`);
  적은것.push(후개수 >= 전개수 + 2 ? `✅ 답이 왔다 (말풍선 ${전개수}→${후개수})` : `❌ 답이 안 왔다 (말풍선 ${전개수}→${후개수})`);
  const 넘침 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  적은것.push(넘침 ? "❌ 가로로 넘친다" : "✅ 가로 안 넘침");
} finally {
  await browser.close();
  await db.auth.admin.deleteUser(USER);
}
console.log(적은것.join("\n"));
console.log(OUT);
process.exit(적은것.some((s) => s.startsWith("❌")) ? 1 : 0);
