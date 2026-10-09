/** 캐릭터 목록과 카드 창을 한 장씩 찍는다 (10-09). 모델 0 · 값 0. */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
const 나올 = "engine/docs/ui-ask";
const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.evaluate(() => { const w = window as any;
    for (const k of ["검사","회복술사","흑마법사"]) if (!w.S.대원.some((c: any) => c.키 === k)) w.S.대원.push(w.대원만들기(k, 12));
    for (const c of w.S.대원) c.레벨 = 12 + Math.floor(Math.random()*4);
    w.S.파티 = w.S.대원.slice(0,4).map((c: any) => c.id); w.S.대표 = w.S.대원[0].id;
    Object.assign(w.S.가방, { 파편: 99, 잔혼: 99, 수호핵: 9, 별가루: 315 });
    w.S.최고층 = 12; w.S.금화 = 6220; w.만들기("철검"); w.만들기("가죽갑옷");
    w.S.탭 = "crew"; });
  await page.evaluate(() => (document.querySelector('.tab[data-t="crew"]') as HTMLElement).click());
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `${나올}/캐릭터-목록.png` as `${string}.png` });
  await page.evaluate(() => (document.querySelector("#panel .row.카드열기") as HTMLElement).click());
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: `${나올}/캐릭터-카드.png` as `${string}.png` });
  console.log("찍음: 캐릭터-목록.png · 캐릭터-카드.png");
} finally { await 창.browser.close(); await 창.close?.(); }
