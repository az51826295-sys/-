/**
 * 왜 `.kk-title` 이 서버에선 41px, 조각으로 그린 방에선 20px 인가.
 *   node title_probe.mjs <magicLink> <base>
 * 둘 중 하나는 거짓말을 하고 있다 — 고치기 전에 그걸 먼저 안다.
 */
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [magic, base] = process.argv.slice(2);
const url = base + magic.slice(magic.indexOf("/auth/confirm"));
const profile = mkdtempSync(join(tmpdir(), "rk-hl-titleprobe-"));
const browser = await puppeteer.launch({
  executablePath: process.env.DOT_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, userDataDir: profile, args: ["--no-first-run", "--lang=ko-KR"],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await page.goto(base + "/dot/yuna", { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));
  const out = await page.evaluate(`(() => {
    var t = document.querySelector('.kk-title');
    if (!t) return { 없다: true };
    var cs = getComputedStyle(t), r = t.getBoundingClientRect();
    var bar = document.querySelector('.kk-bar'), bcs = bar ? getComputedStyle(bar) : null;
    return {
      높이: Math.round(r.height), 폭: Math.round(r.width),
      글자: cs.fontSize + ' / 줄높이 ' + cs.lineHeight + ' / ' + cs.fontFamily.slice(0, 30),
      패딩: cs.paddingTop + ' ' + cs.paddingBottom, 보임: cs.display,
      안쪽: t.innerHTML.slice(0, 120),
      띠: bcs ? ('align-items:' + bcs.alignItems + ' height:' + bcs.height) : null,
      자식수: t.children.length
    };
  })()`);
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 지워지면 됐다 */ }
}
