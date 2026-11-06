/**
 * **출석 단추를 진짜로 눌러 본다** (11-06).
 *
 *   node engine/work/ui-audit/peek_make.mjs            ← 로그인 링크 하나
 *   DOT_BASE=http://localhost:3010 npx tsx engine/tools/dot_checkin_click_test.mts <magicLink>
 *
 * `dot_checkin_test.mts` 는 라우트 함수를 **토큰으로** 불렀다. 그런데 사람이 누르는 길은
 * **쿠키**다 — 그 길은 Next 요청 안에서만 읽히므로 라우트를 직접 부르는 자로는 못 쟀다
 * (그래서 그 자에 "못 재는 것" 으로 적어 뒀다). 여기서는 브라우저로 로그인해 **화면의 단추를
 * 눌러** 숫자가 바뀌는 것까지 본다 — 쿠키·서버 액션·새로고침이 다 끼어 있는 진짜 길이다.
 *
 * 재는 것: ① 머리에 "출석 ♥+5" 가 있다 ② 누르면 하트가 5가 된다 ③ 다시 열어도 5다(서버에 남았다)
 *          ④ 그 자리에 단추가 더는 없다(두 번 받을 자리가 안 남는다)
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
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true, userDataDir: profile, args: ["--no-first-run", "--lang=ko-KR"],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});
const 줄: [boolean, string][] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 머리의 하트 칸을 글자로 읽는다. 단추면 "출석…", 숫자면 "♥5". */
const 읽기 = `(() => {
  var el = document.querySelector('.hb');
  return el ? { 글: (el.textContent || '').trim(), 단추: el.tagName === 'BUTTON' } : null;
})()`;

try {
  const page = await browser.newPage();
  await page.goto(magic, { waitUntil: "networkidle2", timeout: 60_000 });
  await page.goto(`${BASE}/dot/chats`, { waitUntil: "networkidle2", timeout: 60_000 });
  await sleep(800);

  const 전 = await page.evaluate(읽기) as { 글: string; 단추: boolean } | null;
  줄.push([!!전?.단추 && (전?.글 ?? "").includes(String(CHECKIN_HEARTS)),
    `머리에 출석 단추: "${전?.글 ?? "없음"}" (단추 ${전?.단추})`]);

  if (전?.단추) {
    await page.click(".hb-get");
    await sleep(8000);   /* 개발 서버는 이 길을 처음 불릴 때 컴파일한다 — 1.5초로는 "받는 중…" 에서 끝난다 */
  }
  const 후 = await page.evaluate(읽기) as { 글: string; 단추: boolean } | null;
  줄.push([(후?.글 ?? "").includes(String(CHECKIN_HEARTS)) && !후?.단추,
    `누른 뒤: "${후?.글 ?? "없음"}" (단추 ${후?.단추} — false 여야)`]);

  /* 새로고침해도 남아 있나 — 화면에서만 바뀐 것이면 여기서 들통난다. */
  await page.goto(`${BASE}/dot/me`, { waitUntil: "networkidle2", timeout: 60_000 });
  await sleep(600);
  const 다시 = await page.evaluate(읽기) as { 글: string; 단추: boolean } | null;
  줄.push([(다시?.글 ?? "").includes(String(CHECKIN_HEARTS)) && !다시?.단추,
    `다른 화면에서도: "${다시?.글 ?? "없음"}" (서버에 남았다)`]);
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}

for (const [ok, s] of 줄) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
const 통과 = 줄.filter(([ok]) => ok).length;
console.log(`\n  ${통과}/${줄.length}`);
process.exit(통과 === 줄.length ? 0 : 1);
