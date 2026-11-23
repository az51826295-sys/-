/**
 * **링크 미리보기 카드(og:image) 굽기** (11-23, 사장님 "웹프로필 꾸미자" → 링크 미리보기 카드).
 *   npx tsx engine/tools/dot_og_card.mts   → public/dot-og.png (1200×630)
 *
 * 새 그림을 지어내지 않는다 — 이미 쓰는 앱 아이콘·**지금 사이트의 영어 검색 화면**(캐스트 열 명)·확정된 소개 문장(lang.ts feed_intro_*)만 놓는다.
 * 영어가 기본(11-22)이라 화면도 영어로 찍는다 — 옛 dot-shots 는 한국어라 안 쓴다.
 * 헤드리스 크롬으로 HTML 을 찍는다(Galmuri 글꼴을 그대로 쓰려고). 모델 0 · 값 0.
 */
import { readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const b64 = (p: string) => readFileSync(p).toString("base64");
const icon = b64("public/dot-icon-512.png");
const font = b64("public/fonts/Galmuri11-ko.woff2");

const card = (shot: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:G;src:url(data:font/woff2;base64,${font}) format("woff2")}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#fff;font-family:G,monospace;overflow:hidden;display:flex;align-items:center;padding:0 0 0 80px;position:relative}
.l{flex:1;display:flex;flex-direction:column;gap:22px}
.icon{width:132px;height:132px;image-rendering:pixelated;border-radius:28px}
h1{font-size:64px;color:#111;letter-spacing:1px}
p{font-size:34px;line-height:1.35;color:#222;max-width:600px}
small{font-size:26px;color:#777}
.url{font-size:24px;color:#e2557a;margin-top:6px}
.r{width:420px;height:630px;position:relative}
.phone{position:absolute;top:48px;left:24px;width:340px;height:640px;border-radius:40px;border:10px solid #111;box-shadow:0 18px 40px rgba(0,0,0,.18);overflow:hidden;background:#fff}
.phone img{width:100%;display:block}
</style></head><body>
<div class="l">
  <img class="icon" src="data:image/png;base64,${icon}">
  <h1>Dot</h1>
  <p>Chat with pixel characters, like texting a friend</p>
  <small>Their face changes every time they talk.<br>No sign-up.</small>
  <div class="url">dugeundot.com</div>
</div>
<div class="r"><div class="phone"><img src="data:image/png;base64,${shot}"></div></div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: process.env.DOT_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-first-run", "--lang=en-US"] });
try {
  const site = process.env.DOT_SITE ?? "https://dugeundot.com";
  const sp = await browser.newPage();
  await sp.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" });
  await sp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sp.goto(`${site}/dot/search`, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1500));
  const shot = Buffer.from(await sp.screenshot({ type: "png" })).toString("base64");
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.setContent(card(shot), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
  writeFileSync("public/dot-og.png", png);
  console.log("public/dot-og.png", png.length, "bytes");
} finally {
  await browser.close();
}
