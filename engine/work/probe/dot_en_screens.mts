/**
 * **영어로 바꾸면 화면이 정말 영어가 되나** (10-28 사장님 "영어 버튼도 안돼고").
 *   npx tsx engine/work/probe/dot_en_screens.mts
 *
 * 단추는 먹는다(설정 화면 글이 202→220 으로 바뀌었다). 그런데 사람에게는 **안 먹는 것처럼
 * 보인다** — 바뀌는 글이 몇 줄뿐이면 화면은 여전히 한국어이기 때문이다.
 *
 * 그래서 "단추가 눌리나" 가 아니라 **화면에 한글이 얼마나 남나**를 센다
 * ([[ruler-scope-must-match-product]]: 자가 보는 범위가 제품 범위와 같아야 한다).
 * 안 열린 화면은 0 이 아니라 **못 잼**이다.
 */
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://dot-web-production-7e03.up.railway.app";
const 화면 = ["/dot/feed", "/dot/tarot", "/dot/search", "/dot/chats", "/dot/me", "/dot/settings", "/dot/nabi"];

const profile = mkdtempSync(join(tmpdir(), "rk-hl-en-"));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true, userDataDir: profile,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const p = await browser.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  /* 영어로 못 박는다 — 단추를 누르는 것과 같은 값(lang.ts 의 dot_lang). */
  await p.goto(BASE + "/dot/settings", { waitUntil: "networkidle2", timeout: 60000 });
  await p.evaluate(() => localStorage.setItem("dot_lang", "en"));

  console.log("화면           글자   한글   한글비율   남은 한국어 보기");
  let 합글자 = 0, 합한글 = 0, 못잼 = 0;
  for (const 길 of 화면) {
    try {
      await p.goto(BASE + 길, { waitUntil: "networkidle2", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 2500));
      const t = await p.evaluate(() => document.body.innerText ?? "");
      const 글자 = t.replace(/\s/g, "");
      if (글자.length < 10) { console.log(`${길.padEnd(14)} **못 잼**(화면이 비었다)`); 못잼++; continue; }
      const 한글 = (글자.match(/[\uac00-\ud7a3]/g) ?? []).length;
      합글자 += 글자.length; 합한글 += 한글;
      /* 남은 한국어를 **보여 준다** — 숫자만 주면 어디를 고쳐야 하는지 모른다. */
      const 보기 = [...new Set((t.match(/[\uac00-\ud7a3][\uac00-\ud7a3 ]{1,14}/g) ?? []).map((s) => s.trim()))].slice(0, 3).join(" · ");
      console.log(`${길.padEnd(14)} ${String(글자.length).padStart(5)} ${String(한글).padStart(5)}   ${((한글 / 글자.length) * 100).toFixed(0).padStart(4)}%   ${보기}`);
    } catch {
      console.log(`${길.padEnd(14)} **못 잼**(안 열렸다)`); 못잼++;
    }
  }
  console.log(`\n전체 글자 ${합글자} 중 한글 ${합한글} — **${((합한글 / Math.max(1, 합글자)) * 100).toFixed(0)}%**` + (못잼 ? `  (못 잰 화면 ${못잼}개)` : ""));
} finally {
  await browser.close();
  /* 치우다 실패하는 것은 **시험 결과가 아니다** — EPERM 하나에 판정이 통째로 날아갔다. */
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 윈도가 잠깐 쥐고 있다 */ }
}
