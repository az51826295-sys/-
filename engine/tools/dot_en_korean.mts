/**
 * **영어판에 남은 한국어를 센다 — 판(dialog)까지 열어서** (10-29). 값 0 · 모델 0.
 *   npx tsx engine/tools/dot_en_korean.mts
 *
 * ## 왜 또 만드나
 *
 * 10-28 에 "두근도트 화면 한국어 0%" 라고 적었다. 그 자는 **화면만** 봤다.
 * 그런데 10-29 에 영어 영상을 찍으니 첫 장면부터 한국어가 나왔다 —
 * 방 안내판·날짜 띠·시각·말풍선 안의 "음". 셋 다 **그때 안 열려 있던 것**이다.
 * 안 열린 판은 0 으로 세진다([[ruler-scope-must-match-product]]).
 *
 * 그래서 이 자는 **열어 보고 센다.** 못 연 판은 0 이 아니라 **못 잼**으로 적는다 —
 * 그게 이 자가 지난 자와 다른 점이다.
 *
 * 말풍선(모델이 지금 지어내는 글)은 **따로 센다.** 화면 글은 우리가 고치면 끝이지만
 * 말풍선은 프롬프트를 고치고 다시 받아 봐야 아는 것이라, 같이 세면 원인이 섞인다.
 */
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { 이름헬퍼 } from "./ash_공통.mjs";

const BASE = process.env.DOT_SITE ?? "https://dot-web-production-7e03.up.railway.app";
const profile = mkdtempSync(join(tmpdir(), "dot-en-census-"));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true, userDataDir: profile,
  args: ["--no-first-run", "--lang=en-US"],
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
});
const 쉬기 = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 지금 **보이는** 글의 한글 수와, 걸린 글 몇 개. 말풍선은 빼고 센다(원인이 다르다). */
const 세기 = `(() => {
  const 잎 = [...document.querySelectorAll("body *")].filter((e) => !e.children.length);
  let n = 0; const 걸림 = [];
  for (const e of 잎) {
    if (e.closest(".kk-bubble")) continue;
    const el = e;
    if (!el.offsetParent && getComputedStyle(el).position !== "fixed") continue;
    const t = (e.textContent || "").trim();
    const h = (t.match(/[\\uac00-\\ud7a3]/g) || []).length;
    if (!h) continue;
    n += h; if (걸림.length < 4) 걸림.push(t.slice(0, 44));
  }
  const 말 = [...document.querySelectorAll(".kk-bubble")].map((e) => (e.textContent || "").trim()).join(" ");
  return { 한글: n, 걸림, 말풍선한글: (말.match(/[\\uac00-\\ud7a3]/g) || []).length };
})()`;

type 줄 = { 자리: string; 한글: number | null; 걸림: string[]; 말풍선: number };
const 표: 줄[] = [];

try {
  const page = await browser.newPage();
  await 이름헬퍼(page);
  await page.setCookie({ name: "dot_lang", value: "en", domain: new URL(BASE).hostname, path: "/" });

  /** 한 화면을 열고 센다. */
  const 화면 = async (자리: string, 길: string) => {
    await page.goto(BASE + 길, { waitUntil: "networkidle2", timeout: 90_000 });
    await 쉬기(3000);
    const r = await page.evaluate(세기) as { 한글: number; 걸림: string[]; 말풍선한글: number };
    표.push({ 자리, 한글: r.한글, 걸림: r.걸림, 말풍선: r.말풍선한글 });
  };

  for (const [이름, 길] of [["피드", "/dot"], ["검색", "/dot/search"], ["채팅 목록", "/dot/chats"],
    ["내 창", "/dot/me"], ["타로", "/dot/tarot"], ["프로필", "/dot/doyun/profile"]] as const) {
    await 화면(이름, 길).catch(() => 표.push({ 자리: 이름, 한글: null, 걸림: ["화면을 못 열었다"], 말풍선: 0 }));
  }

  // ── 대화방과 그 안의 판들 ───────────────────────────────────
  await 화면("대화방(안내판 열린 채)", "/dot/doyun");
  for (const 글 of ["Got it", "알겠어요"]) {
    await page.$$eval("button", (bs, t) => {
      const i = bs.findIndex((b) => (b.textContent ?? "").trim() === t);
      if (i >= 0) (bs[i] as HTMLButtonElement).click();
      return i >= 0;
    }, 글).catch(() => false);
  }
  await 쉬기(800);
  const r0 = await page.evaluate(세기) as { 한글: number; 걸림: string[]; 말풍선한글: number };
  표.push({ 자리: "대화방(안내판 닫고)", 한글: r0.한글, 걸림: r0.걸림, 말풍선: r0.말풍선한글 });

  /**
   * 방 안의 **판**은 눌러서 연다. 판마다 **화면을 새로 연다** — 10-29 첫 판에서 메뉴가 열린 채로
   * 다음 단추를 누르는 바람에 같은 판을 두 번 재고 98자를 새 사실인 양 적었다
   * ([[rulers-must-not-share-a-screen]]).
   *
   * 그리고 **앞서 잰 판과 글이 똑같으면 못 잼**으로 적는다 — 그게 "안 열렸다" 의 신호다.
   */
  const 지문: Map<string, string> = new Map();
  const 방열기 = async () => {
    await page.goto(BASE + "/dot/doyun", { waitUntil: "networkidle2", timeout: 90_000 });
    await 쉬기(2600);
    for (const 글 of ["Got it", "알겠어요"]) {
      await page.$$eval("button", (bs, t) => {
        const i = bs.findIndex((b) => (b.textContent ?? "").trim() === t);
        if (i >= 0) (bs[i] as HTMLButtonElement).click();
        return i >= 0;
      }, 글).catch(() => false);
    }
    await 쉬기(700);
  };

  const 판 = async (자리: string, 고르기: string) => {
    await 방열기();
    const 눌렀나 = await page.evaluate((sel: string) => {
      const e = document.querySelector(sel) as HTMLElement | null;
      if (!e) return false;
      e.click(); return true;
    }, 고르기).catch(() => false);
    await 쉬기(1200);
    if (!눌렀나) { 표.push({ 자리, 한글: null, 걸림: [`단추를 못 찾음 (${고르기})`], 말풍선: 0 }); return; }
    const r = await page.evaluate(세기) as { 한글: number; 걸림: string[]; 말풍선한글: number };
    const 키 = r.걸림.join("|");
    const 같은곳 = 지문.get(키);
    if (같은곳) { 표.push({ 자리, 한글: null, 걸림: [`"${같은곳}" 과 글이 똑같다 — 안 열린 것으로 본다`], 말풍선: 0 }); return; }
    지문.set(키, 자리);
    표.push({ 자리, 한글: r.한글, 걸림: r.걸림, 말풍선: r.말풍선한글 });
  };

  await 판("≡ 메뉴", "[aria-label='메뉴'], .kk-hamb, .kk-head-menu");
  await 판("선물 판", "[aria-label='선물'], .kk-gift-open, .kk-plus");
  await 판("스티커 판", "[aria-label='스티커'], .kk-sticker-open, .kk-emoji");
  await 판("얼굴 누름(프로필 미리보기)", ".kk-face");
} finally {
  await browser.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 지워지면 됐다 */ }
}

console.log("자리                          한글   말풍선 한글");
for (const r of 표) {
  console.log(`${r.자리.padEnd(28)} ${r.한글 === null ? "못 잼" : String(r.한글).padStart(4)}   ${String(r.말풍선).padStart(4)}`
    + (r.걸림.length ? `\n    ${r.걸림.join(" | ")}` : ""));
}
const 잰것 = 표.filter((r) => r.한글 !== null);
const 합 = 잰것.reduce((a, r) => a + (r.한글 ?? 0), 0);
const 못잼 = 표.length - 잰것.length;
console.log(`\n잰 자리 ${잰것.length}곳 · 화면 한글 ${합}자 · 못 잰 자리 ${못잼}곳`);
if (못잼) console.log("**못 잰 자리는 0 이 아니다** — 거기에 한국어가 있는지 아직 모른다.");
process.exitCode = 합 > 0 ? 1 : 0;
