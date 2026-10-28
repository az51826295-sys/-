/** 영어 화면 한 장 (10-28). 로그인 없이 보이는 곳만. */
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://dot-web-production-7e03.up.railway.app";
const OUT = "C:/Users/az518/Desktop/두근도트-화면";
mkdirSync(OUT, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), "rk-hl-shot-"));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true, userDataDir: profile, args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const p = await browser.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.goto(BASE + "/dot/settings", { waitUntil: "networkidle2", timeout: 60000 });
  await p.evaluate(() => { localStorage.setItem("dot_lang", "en"); document.cookie = "dot_lang=en;path=/;max-age=31536000"; });
  for (const [이름, 길] of [["영어-검색", "/dot/search"], ["영어-피드", "/dot/feed"]] as const) {
    await p.goto(BASE + 길, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2800));
    await p.screenshot({ path: `${OUT}/${이름}.png` as `${string}.png` });
    console.log("찍음:", `${OUT}/${이름}.png`);
  }
} finally {
  await browser.close();
  /* 치우다 실패하는 것은 **시험 결과가 아니다** — EPERM 하나에 판정이 통째로 날아갔다. */
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 윈도가 잠깐 쥐고 있다 */ }
}
