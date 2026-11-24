/** /pixel 화면 사진(폰 폭) — 그림 하나 올리고 미리보기가 뜬 모습. npx tsx engine/tools/pixel_shot.mts [그림] */
import puppeteer from "puppeteer-core";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const IMG = process.argv[2] ?? "C:/Users/az518/Desktop/두근도트-시트/nabi-sheet.png";
const browser = await puppeteer.launch({
  executablePath: process.env.DOT_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, userDataDir: mkdtempSync(join(tmpdir(), "pixshot-")), args: ["--lang=ko-KR"],
});
try {
  const p = await browser.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.setExtraHTTPHeaders({ "accept-language": "ko-KR,ko;q=0.9" });
  await p.goto("https://dugeundot.com/pixel", { waitUntil: "networkidle2" });
  await p.screenshot({ path: "engine/work/realdot/shot-empty.png" });
  const input = await p.$("input[type=file]");
  await input!.uploadFile(IMG);
  await p.waitForSelector("img.px", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));
  await p.screenshot({ path: "engine/work/realdot/shot-preview.png", fullPage: true });
  console.log("ok", await p.$eval(".rp-buy", (e) => (e as HTMLElement).innerText));
} finally { await browser.close(); }
