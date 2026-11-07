/**
 * **출석 판이 저절로 뜨고, 눌러서 받아진다** — 브라우저로 진짜 눌러 본다 (11-06).
 *
 *   node engine/work/ui-audit/peek_make.mjs            ← 로그인 링크 하나
 *   DOT_BASE=http://localhost:3010 npx tsx engine/tools/dot_checkin_click_test.mts <magicLink>
 *
 * `dot_checkin_test.mts` 는 라우트 함수를 **토큰으로** 불렀다. 사람이 지나는 길은 **쿠키**이고,
 * 그 길은 Next 요청 안에서만 읽히므로 라우트를 직접 부르는 자로는 못 쟀다. 여기서는
 * 로그인한 브라우저로 들어가 **판이 뜨는지**, **눌러서 받아지는지**, **머리 숫자가 바뀌는지**,
 * **다시 안 뜨는지**까지 본다.
 *
 * 못 재는 것: 자정이 지나 다음 날 다시 뜨는가(날이 바뀌어야 잰다).
 */
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const magic0 = process.argv[2];
if (!magic0 || !magic0.includes("/auth/confirm")) { console.error("사용: <magicLink>  (peek_make.mjs 가 만든다)"); process.exit(1); }
const BASE = (process.env.DOT_BASE ?? "https://dot-web-production-7e03.up.railway.app").replace(/\/$/, "");
const magic = BASE + magic0.slice(magic0.indexOf("/auth/confirm"));

const { CHECKIN_HEARTS } = await import("../../src/lib/dot/bond");

const profile = mkdtempSync(join(tmpdir(), "dot-checkin-"));
const browser = await puppeteer.launch({
  executablePath: process.env.DOT_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, userDataDir: profile, args: ["--no-first-run", "--lang=ko-KR"],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});
const 줄: [boolean, string][] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 화면에서 읽는 것: 출석 판이 떴나 · 머리의 하트 숫자. */
const 읽기 = `(() => {
  var card = document.querySelector('.ci-card');
  var hb = document.querySelector('.hb');
  return { 판: !!card, 판글: card ? (card.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40) : '',
           하트: hb ? (hb.textContent || '').trim() : '없음' };
})()`;

try {
  const page = await browser.newPage();
  await page.goto(magic, { waitUntil: "networkidle2", timeout: 60_000 });
  await page.goto(`${BASE}/dot/chats`, { waitUntil: "networkidle2", timeout: 60_000 });
  await sleep(1200);

  const 전 = await page.evaluate(읽기) as { 판: boolean; 판글: string; 하트: string };
  줄.push([전.판, `하루 첫 입장에 출석 판이 뜬다: ${전.판} "${전.판글}"`]);
  줄.push([전.하트.includes("0"), `그때 머리 숫자는 0: "${전.하트}"`]);

  if (전.판) {
    await page.click(".ci-go");
    /* 개발 서버는 이 길을 처음 불릴 때 컴파일한다 — 짧게 기다리면 "받는 중…" 에서 끝난다. */
    await sleep(9000);
  }
  const 후 = await page.evaluate(읽기) as { 판: boolean; 판글: string; 하트: string };
  줄.push([!후.판 && 후.하트.includes(String(CHECKIN_HEARTS)),
    `받고 나면 판이 닫히고 머리가 바뀐다: 판 ${후.판}(false) · "${후.하트}"(♥${CHECKIN_HEARTS})`]);

  /* 다른 화면으로 가도 안 뜨고 숫자는 남아 있다 — 화면에서만 바뀐 것이면 여기서 들통난다. */
  await page.goto(`${BASE}/dot/me`, { waitUntil: "networkidle2", timeout: 60_000 });
  await sleep(1000);
  const 다시 = await page.evaluate(읽기) as { 판: boolean; 판글: string; 하트: string };
  줄.push([!다시.판 && 다시.하트.includes(String(CHECKIN_HEARTS)),
    `다른 화면: 판 ${다시.판}(false) · "${다시.하트}" (서버에 남았다)`]);
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}

for (const [ok, s] of 줄) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
const 통과 = 줄.filter(([ok]) => ok).length;
console.log(`\n  ${통과}/${줄.length}`);
process.exit(통과 === 줄.length ? 0 : 1);
