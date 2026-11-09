/**
 * # 타로 화면을 **진짜로 띄워** 찍는다 (11-09)
 *
 *   npm run dev 를 먼저 띄우고:
 *   npx tsx engine/tools/dot_tarot_shot.mts
 *
 * 조각으로 그려 찍으면 **API·로그인·그리는 순서**가 다 빠진다. 그래서 시험 계정을 만들어
 * 몇 마디 나누고, 마법 링크로 들어가 `/dot/tarot` 에서 **실제로 카드를 받는다.**
 * 끝나면 계정을 지운다.
 *
 * 재는 것(사진과 별개로): 카드 세 장이 그려졌나 · 뒤집히나 · 가로로 넘치나 · 깨진 그림.
 */
import { readFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
import puppeteer from "puppeteer-core";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { runDotTurn } = await import("../../src/lib/dot/turn");
const { todayKST, CHECKIN_HEARTS } = await import("../../src/lib/dot/bond");

const BASE = process.env.DOT_BASE ?? "http://localhost:3000";
const OUT = "C:/Users/az518/Desktop/로키-도트/타로-20261109";
mkdirSync(OUT, { recursive: true });
const db = createServiceClient();

const { data: c } = await db.from("dot_characters").select("id, slug, name").eq("slug", "rin").single();
const 메일 = `tarotshot-${Date.now()}@dugeun.local`;
const { data: 만든것, error: e1 } = await db.auth.admin.createUser({ email: 메일, password: `t-${Math.random().toString(36).slice(2)}!`, email_confirm: true });
if (e1 || !만든것?.user) { console.error(`시험 계정을 못 만들었다: ${e1?.message}`); process.exit(1); }
const USER = 만든것.user.id;
await db.from("dot_usage").upsert({ user_id: USER, day: todayKST(), turns: 0, bonus_turns: CHECKIN_HEARTS, ad_refills: 0 }, { onConflict: "user_id,day" });
await db.from("dot_wallet").upsert({ user_id: USER, credits: 40 }, { onConflict: "user_id" });

console.log(`${c!.name} 와 몇 마디 — 카드는 대화가 있어야 읽힌다`);
for (const m of ["안녕! 오늘 처음 말 걸어 봐", "요즘 시험 기간이라 잠을 못 자", "어제는 새벽 세 시에 라면 끓여 먹었어", "너는 밤에 뭐 해?"]) {
  const r: any = await runDotTurn(db, USER, c!.id as string, m);
  if (!r.ok) { console.log(`  ❌ ${r.reason} ${r.message ?? ""}`); break; }
  process.stdout.write(`  ${r.bond.points}점 ${r.bond.stage}단계\r`);
}

const { data: link, error: e2 } = await db.auth.admin.generateLink({ type: "magiclink", email: 메일 });
if (e2 || !link) { console.error(`들어갈 링크를 못 만들었다: ${e2?.message}`); process.exit(1); }
const 들어가기 = `${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink&next=/dot/tarot`;

const browser = await puppeteer.launch({
  executablePath: process.env.DOT_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, userDataDir: `${process.env.TEMP}/rk-hl-tarot-${process.pid}`, args: ["--no-first-run", "--lang=ko-KR"],
});
const 적은것: string[] = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  /* dev 서버는 화면을 처음 열 때 그 자리에서 짓는다 — 30초로는 모자라 첫 판이 늘 실패했다. */
  page.setDefaultNavigationTimeout(180_000);
  await page.goto(들어가기, { waitUntil: "domcontentloaded" });
  await page.goto(`${BASE}/dot/tarot`, { waitUntil: "domcontentloaded" });
  /* dev 는 화면을 그리는 데도 몇 초가 든다. 시간으로 기다리면 사진이 "세는 중" 으로 찍힌다 —
     **그려졌다는 표시**를 기다린다(첫 판에 그걸 안 해서 빈 화면을 두 번 찍었다). */
  await page.waitForSelector(".tr-one", { timeout: 120_000 });
  await page.screenshot({ path: `${OUT}/1-점집.png`, fullPage: true });

  /* 카드 받기 — 진짜로 누른다 */
  const 단추 = await page.$(".tr-draw");
  적은것.push(단추 ? "✅ 받기 단추가 있다" : "❌ 받기 단추가 없다");
  if (단추) {
    await 단추.click();
    await new Promise((r) => setTimeout(r, 9000));
    await page.screenshot({ path: `${OUT}/2-받은뒤.png`, fullPage: true });
  }
  const 카드수 = await page.$$eval(".tz-card", (e) => e.length).catch(() => 0);
  적은것.push(카드수 === 3 ? "✅ 카드 세 장" : `❌ 카드 ${카드수}장`);

  /* 뒤집기 */
  for (const el of await page.$$(".tz-card")) await el.click();
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: `${OUT}/3-뒤집음.png`, fullPage: true });
  const 열림 = await page.$$eval(".tz-card.on", (e) => e.length).catch(() => 0);
  적은것.push(열림 === 카드수 && 카드수 > 0 ? "✅ 전부 뒤집힌다" : `❌ ${열림}/${카드수} 만 뒤집혔다`);

  const 잰것 = await page.evaluate(() => ({
    넘침: document.documentElement.scrollWidth > window.innerWidth,
    깨진그림: [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0).length,
    말: [...document.querySelectorAll(".tz-say")].map((e) => e.textContent ?? ""),
    관계: document.querySelector(".tz-sum")?.textContent ?? "",
  }));
  적은것.push(잰것.넘침 ? "❌ 가로로 넘친다" : "✅ 가로 안 넘침");
  적은것.push(잰것.깨진그림 ? `❌ 깨진 그림 ${잰것.깨진그림}` : "✅ 깨진 그림 없음");
  for (const s of 잰것.말) console.log(`  ${s}`);
  if (잰것.관계) console.log(`  ${잰것.관계}`);

  /* 방 안에서도 같은 것이 보이나 */
  await page.goto(`${BASE}/dot/${c!.slug}`, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 1800));
  /* 처음 들어온 방에는 "이 방 쓰는 법" 이 깔린다 — 안 치우면 카드가 그 뒤에 가린다. */
  for (const b of await page.$$("button")) {
    const t = await page.evaluate((e) => e.textContent ?? "", b);
    if (t.includes("알겠어요")) { await b.click(); break; }
  }
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate(() => { for (const el of document.querySelectorAll("*")) if (el.scrollHeight > el.clientHeight + 8) el.scrollTop = el.scrollHeight; });
  /* 카드는 눌러야 뒤집힌다 — 사진에도 열린 채로 담는다. */
  for (const el of await page.$$(".kk-tarot .tz-card")) await el.click();
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => { for (const el of document.querySelectorAll("*")) if (el.scrollHeight > el.clientHeight + 8) el.scrollTop = el.scrollHeight; });
  await page.screenshot({ path: `${OUT}/4-방안.png` });
  const 방카드 = await page.$$eval(".kk-tarot .tz-card", (e) => e.length).catch(() => 0);
  적은것.push(방카드 === 3 ? "✅ 방 안에도 카드 세 장" : `❌ 방 안 카드 ${방카드}장`);
} finally {
  await browser.close();
  await db.auth.admin.deleteUser(USER);
}
console.log(`\n${적은것.join("\n")}`);
console.log(OUT);
process.exit(적은것.some((s) => s.startsWith("❌")) ? 1 : 0);
