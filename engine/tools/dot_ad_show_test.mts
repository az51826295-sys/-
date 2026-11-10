/**
 * **광고를 끝까지 본 것만 하트를 준다** — 브라우저로 진짜 눌러 본다 (11-07).
 *
 *   node engine/work/ui-audit/peek_make.mjs                                   ← 로그인 링크 하나
 *   DOT_BASE=http://localhost:3010 npx tsx engine/tools/dot_ad_show_test.mts <magicLink>
 *   DOT_BASE=http://localhost:3010 npx tsx engine/tools/dot_ad_show_test.mts <magicLink> --sabotage
 *   npx tsx engine/tools/dot_ad_show_test.mts <magicLink> --off                ← 운영(광고 꺼짐)에 대고
 *
 * 로컬 서버는 광고 설정을 켜서 띄워야 한다:
 *   AD_REWARD_OPEN=1  ADSENSE_CLIENT=ca-pub-0000000000000000  ADSENSE_TEST=1  npx next dev -p 3010
 *
 * ## 이 자가 왜 필요했나
 *
 * 11-06 까지 `watchAd()` 안에는 주석만 있었다 — "여기에 광고 SDK 가 들어온다". 즉 단추를
 * 누르면 **광고 없이 하트가 찼다.** 그래서 스위치를 못 켰다. 고친 뒤에 물어야 할 것은
 * "광고가 뜨나" 가 아니라 **"안 본 광고로 하트가 새나"** 다 — 그게 돈이 새는 자리다.
 *
 * ## 무엇을 재나
 *
 *  ① 광고 설정이 **있을 때만** 광고 줄이 보인다(`--off` 로 반대쪽도 잰다)
 *  ② 구글 H5 스크립트가 **실제로 뜬다** (시험 모드, 계정 없이) — 200 인가
 *  ③ **닫은 광고** → 하트 안 늘고, 말이 다르다
 *  ④ **광고 없음** → 하트 안 늘고, 말이 다르다
 *  ⑤ **끝까지 본 광고** → 하트 +1
 *  ⑥ `/api/dot/ad` 를 **딱 한 번** 부른다(⑤ 때만) — 세 번 눌렀는데 세 번 부르면 ③④가 샌 것이다
 *
 * ## 못 재는 것 (정직하게)
 *
 * **진짜 광고가 화면에 그려지는지는 못 잰다.** 시험 모드는 구글 서버에 광고 요청을 안 보낸다.
 * 광고주 번호(AdSense 계정)가 생긴 뒤에 한 번 더 재야 한다. 여기서 재는 것은 **판단**이다 —
 * 광고망이 "봤다/닫았다/없다" 중 무엇을 말하든 제품이 올바르게 갈라 주는가.
 * 가짜 광고망(`window.__dotAdFake`)은 **시험 모드일 때만** 제품이 쳐다본다.
 *
 * ## --sabotage
 *
 * 통과만 보면 자가 눈이 멀었는지 알 수 없다([[ruler-must-catch-a-reproduced-bug]]).
 * 이 스위치는 **진짜 있을 수 있는 고장**을 심는다: `adDismissed` 를 "봤다" 로 읽는 것
 * (= 광고를 닫아도 하트를 주는 11-06 이전 상태). 심으면 ③과 ⑥이 **반드시 빨개야** 한다.
 * 원본은 끝에 되돌린다 — 그래도 끝나고 git 으로 한 번 확인할 것.
 */
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const magic0 = process.argv[2];
if (!magic0 || !magic0.includes("/auth/confirm")) { console.error("사용: <magicLink> [--off] [--sabotage]  (peek_make.mjs 가 링크를 만든다)"); process.exit(1); }
const 꺼짐기대 = process.argv.includes("--off");
const 심기 = process.argv.includes("--sabotage");
const BASE = (process.env.DOT_BASE ?? "https://dot-web-production-7e03.up.railway.app").replace(/\/$/, "");
const magic = BASE + magic0.slice(magic0.indexOf("/auth/confirm"));

const { AD_REFILL_TURNS } = await import("../../src/lib/dot/money");

/* ── 고장 심기: 제품 파일을 잠깐 바꾼다. finally 에서 반드시 되돌린다. ── */
const 파일 = "src/lib/dot/adbreak.ts";
const 원본 = readFileSync(파일, "utf8");
const 성한줄 = 'adDismissed: () => 끝("dismissed"),';
const 심은줄 = 'adDismissed: () => 끝("viewed"),';
if (심기) {
  if (!원본.includes(성한줄)) { console.error(`고장을 심을 줄을 못 찾았다 — ${파일} 이 바뀌었나?`); process.exit(1); }
  writeFileSync(파일, 원본.replace(성한줄, 심은줄));
  console.log("심었다: 닫은 광고를 '봤다' 로 읽게 함 — ③⑥ 이 빨개야 한다");
}

const profile = mkdtempSync(join(tmpdir(), "dot-adshow-"));
const browser = await puppeteer.launch({
  executablePath: process.env.DOT_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, userDataDir: profile, args: ["--no-first-run", "--lang=ko-KR"],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});
const 줄: [boolean, string][] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 화면에서 읽는 것: 머리 하트 숫자 · 시트의 광고 줄 · 토스트. */
const 읽기 = [
  "(() => {",
  "  var hb = document.querySelector('.hb');",
  "  var rows = [].slice.call(document.querySelectorAll('button.hb-row'));",
  "  var ad = rows.filter(function(r){ return (r.textContent||'').indexOf('광고') >= 0; })[0];",
  "  var t = document.querySelector('.hb-toast');",
  "  var n = hb ? (hb.textContent||'').replace(/[^0-9]/g, '') : '';",
  "  return { 하트: n === '' ? -1 : Number(n), 광고줄: !!ad,",
  "           토스트: t ? (t.textContent||'').trim() : '' };",
  "})()",
].join("\n");
type 본것 = { 하트: number; 광고줄: boolean; 토스트: string };

/** 가짜 광고망 — `__dotAdCase` 가 말하는 대로 콜백을 부른다. 제품의 **갈림**만 잰다. */
const 가짜 = [
  "window.__dotAdCase = 'dismissed';",
  "window.__dotAdFake = function(o) {",
  "  var c = window.__dotAdCase;",
  "  if (c === 'nofill') { if (o.adBreakDone) o.adBreakDone({ breakStatus: 'noAdPreloaded' }); return; }",
  "  if (o.beforeReward) o.beforeReward(function () {",
  "    if (c === 'viewed') { if (o.adViewed) o.adViewed(); } else { if (o.adDismissed) o.adDismissed(); }",
  "    if (o.afterAd) o.afterAd();",
  "    if (o.adBreakDone) o.adBreakDone({ breakStatus: c });",
  "  });",
  "};",
].join("\n");

try {
  /* ── 로그인 + 출석 받기(머리 숫자를 0 아닌 값으로 만든다) ── */
  const 문 = await browser.newPage();
  await 문.goto(magic, { waitUntil: "networkidle2", timeout: 60_000 });
  await 문.goto(`${BASE}/dot/chats`, { waitUntil: "networkidle2", timeout: 60_000 });
  await sleep(1500);
  if (await 문.$(".ci-go")) { await 문.click(".ci-go"); await sleep(9000); }
  await 문.close();

  if (꺼짐기대) {
    /* 광고 설정이 없는 서버(운영)에서는 광고 줄이 **없어야** 한다. */
    const p = await browser.newPage();
    await p.goto(`${BASE}/dot/chats`, { waitUntil: "networkidle2", timeout: 60_000 });
    await sleep(1500);
    if (await p.$(".ci-go")) { await p.click(".ci-go"); await sleep(9000); }
    /* 머리 하트가 없으면 **로그인이 안 된 것**이다(링크는 한 번 쓰면 끝난다). 그건 실패가 아니라
       **못 잰 것**이다 — 터지지 않고 그렇게 적는다([[unmeasurable-test-is-not-a-failure]]). */
    if (!(await p.$(".hb"))) {
      console.log("못 잼  ① 로그인이 안 됐다(링크를 이미 썼나?) — 새 링크로 다시");
      await p.close();
    } else {
      await p.click(".hb"); await sleep(900);
      const r = await p.evaluate(읽기) as 본것;
      줄.push([!r.광고줄, `① 설정이 없으면 광고 줄이 없다: 있나=${r.광고줄}(false 여야)`]);
      await p.close();
    }
  } else {
    /* ── ② 구글 스크립트가 실제로 뜨나 (가짜를 안 끼운 쪽에서) ── */
    const p0 = await browser.newPage();
    let 스크립트: number | null = null;
    p0.on("response", (res) => {
      if (res.url().includes("adsbygoogle.js")) 스크립트 = res.status();
    });
    await p0.goto(`${BASE}/dot/chats`, { waitUntil: "networkidle2", timeout: 60_000 });
    await sleep(1500);
    await p0.click(".hb"); await sleep(600);
    const 열림 = await p0.evaluate(읽기) as 본것;
    줄.push([열림.광고줄, `① 설정이 있으면 광고 줄이 보인다: 있나=${열림.광고줄}`]);
    if (열림.광고줄) {
      await p0.evaluate("document.querySelectorAll('button.hb-row')[0].click()");
      await sleep(6000);
    }
    줄.push([스크립트 === 200, `② 구글 H5 스크립트가 뜬다(시험 모드·계정 없이): ${스크립트 ?? "안 불렸다"}`]);
    await p0.close();

    /* ── ③④⑤⑥ 갈림: 가짜 광고망으로 세 경우를 눌러 본다 ── */
    const p = await browser.newPage();
    let 충전호출 = 0;
    p.on("request", (req) => { if (req.url().includes("/api/dot/ad") && req.method() === "POST") 충전호출 += 1; });
    await p.evaluateOnNewDocument(가짜);
    await p.goto(`${BASE}/dot/chats`, { waitUntil: "networkidle2", timeout: 60_000 });
    await sleep(1500);
    /**
     * **덮개를 먼저 치운다** (11-10).
     *
     * 이 자는 11-07 에 6/6 이었는데 오늘 돌리니 "하트 판이 안 열린다" 로 죽었다. 제품이 아니라
     * **그 뒤에 들어온 출석 팝업**(하루 첫 입장에 저절로 뜬다)이 화면을 덮은 것이다. 화면을
     * 재는 자는 덮개가 생길 때마다 같이 죽는다 — 글자로 찾아 치우고, 그래도 안 열리면 사진을 남긴다.
     */
    const 덮개치우기 = async () => {
      for (let i = 0; i < 3; i++) {
        const 쳤나 = await p.evaluate(() => {
          for (const b of Array.from(document.querySelectorAll("button"))) {
            const t = (b.textContent ?? "").trim();
            if (t === "나중에" || t.includes("알겠어요")) { (b as HTMLButtonElement).click(); return true; }
          }
          return false;
        });
        if (!쳤나) break;
        await sleep(400);
      }
    };
    await 덮개치우기();
    await p.evaluate(() => (document.querySelector(".hb") as HTMLButtonElement | null)?.click());
    await sleep(800);
    if (!(await p.$(".hb-sheet"))) {
      await 덮개치우기();
      await p.evaluate(() => (document.querySelector(".hb") as HTMLButtonElement | null)?.click());
      await sleep(800);
    }
    if (!(await p.$(".hb-sheet"))) {
      await p.screenshot({ path: "engine/work/광고-판이안열림.png" });
      throw new Error("하트 판이 안 열린다 — engine/work/광고-판이안열림.png 을 볼 것");
    }

    const 누르기 = async (경우: string) => {
      await p.evaluate(`window.__dotAdCase = '${경우}'`);
      await p.evaluate("document.querySelectorAll('button.hb-row')[0].click()");
      /* 말(토스트)은 **2.2초 뒤 스스로 사라진다** — 처음엔 2.5초를 기다려 빈 글자를 읽고
         제품이 고장난 줄 알았다. 못 본 것과 안 뜬 것을 가르려면 **사라지기 전에** 읽어야 한다.
         충전이 있는 경우만 길게 기다린다(개발 서버가 그 길을 처음 불릴 때 컴파일한다). */
      await sleep(경우 === "viewed" ? 9000 : 900);
      return await p.evaluate(읽기) as 본것;
    };

    const 처음 = await p.evaluate(읽기) as 본것;
    const 닫음 = await 누르기("dismissed");
    줄.push([닫음.하트 === 처음.하트 && 닫음.토스트.includes("끝까지"),
      `③ 닫은 광고는 안 준다: ♥${처음.하트}→${닫음.하트} · "${닫음.토스트}"`]);

    await sleep(2500);   // 토스트가 사라져야 다음 말을 가려 읽지 않는다
    const 없음 = await 누르기("nofill");
    줄.push([없음.하트 === 처음.하트 && 없음.토스트.includes("광고가 없어요"),
      `④ 광고가 없으면 안 준다: ♥${처음.하트}→${없음.하트} · "${없음.토스트}"`]);

    await sleep(2500);
    const 봄 = await 누르기("viewed");
    줄.push([봄.하트 === 처음.하트 + AD_REFILL_TURNS,
      `⑤ 끝까지 본 광고는 +${AD_REFILL_TURNS}: ♥${처음.하트}→${봄.하트}`]);
    줄.push([충전호출 === 1, `⑥ 충전을 딱 한 번 불렀다(세 번 눌렀는데): ${충전호출}번`]);
    await p.close();
  }
} finally {
  await browser.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 지워지면 됐다 */ }
  if (심기) { writeFileSync(파일, 원본); console.log("원본 복원 — git status 로 한 번 더 확인할 것"); }
}

for (const [ok, 글] of 줄) console.log(`${ok ? "맞음  " : "어긋남"} ${글}`);
const 틀림 = 줄.filter(([ok]) => !ok).length;
console.log(틀림 ? `\n**${줄.length - 틀림}/${줄.length}** — 어긋남 ${틀림}건` : `\n**${줄.length}/${줄.length} 전부 맞음**`);
process.exit(틀림 ? 1 : 0);
