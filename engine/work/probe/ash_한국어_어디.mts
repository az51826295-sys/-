/**
 * **한국어가 어느 화면에 몰려 있나** (10-20). 모델 0 · 값 0. 판정하지 않는다 — 숫자만.
 *   ASH_URL=... npx tsx engine/work/probe/ash_한국어_어디.mts
 *
 * 834 개를 다 옮길 수는 없으니 **사람이 제일 많이 읽는 데**부터 옮긴다.
 * 어림짐작 대신 탭마다 들어가 글자를 센다.
 */
import { openHeadless } from "../../../src/lib/video/headless";
import { 이름헬퍼 } from "../../tools/ash_공통.mjs";

const 주소 = (process.env.ASH_URL ?? "http://127.0.0.1:8124/ash/index.html") + `?cb=${Date.now()}`;
const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.evaluate(() => { try { localStorage.clear(); localStorage.setItem("ash.lang", "en"); } catch { /* */ } });
  await page.goto(주소, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1500));

  const 세기 = () => page.evaluate(() => {
    const 글 = (document.body.innerText ?? "");
    const 한 = (글.match(/[가-힣]/g) ?? []).length;
    /* 제일 긴 한국어 토막 다섯 — 어디부터 손댈지 고르는 데 쓴다 */
    const 토막 = [...new Set((글.match(/[가-힣][가-힣 ·,.·0-9%]{6,}/g) ?? []).map((s) => s.trim()))]
      .sort((a, b) => b.length - a.length).slice(0, 5);
    return { 한, 토막 };
  });

  const 탭들 = [["hall", "길드"], ["crew", "캐릭터"], ["run", "전투"], ["forge", "대장간"], ["shop", "시장"]];
  let 합 = 0;
  for (const [키, 이름] of 탭들) {
    await page.evaluate((k) => (document.querySelector(`.tab[data-t="${k}"]`) as HTMLElement | null)?.click(), 키);
    await new Promise((r) => setTimeout(r, 900));
    const r = await 세기();
    합 += r.한;
    console.log(`  ${이름.padEnd(5)} ${String(r.한).padStart(5)}자`);
    for (const t of r.토막) console.log(`        · ${t.slice(0, 70)}`);
  }
  /* 창으로 뜨는 글(공지·설정)도 센다 — 규칙 설명이 여기 다 들어 있다 */
  for (const [id, 이름] of [["#공지단추", "공지"], ["#설정단추", "설정"]]) {
    await page.evaluate((k) => (document.querySelector(`.tab[data-t="hall"]`) as HTMLElement | null)?.click(), "");
    await new Promise((r) => setTimeout(r, 500));
    await page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.click(), id);
    await new Promise((r) => setTimeout(r, 800));
    const r = await 세기();
    console.log(`  ${이름.padEnd(5)} ${String(r.한).padStart(5)}자 (창을 연 채)`);
    await page.keyboard.press("Escape").catch(() => {});
    await page.evaluate(() => document.querySelector(".덮개,.overlay,.쪽창")?.remove());
  }
  console.log(`\n  탭 다섯 합 ${합}자`);
} finally { await 창.browser.close(); await 창.close?.(); }
