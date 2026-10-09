/** 탑 맵과 출발 창을 한 장씩 (10-09). 모델 0 · 값 0. */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mts";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));
  await page.evaluate(() => { const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    for (const k of ["검사","회복술사","흑마법사"]) if (!w.S.대원.some((c: any) => c.키 === k)) w.S.대원.push(w.대원만들기(k, 12));
    w.S.파티 = w.S.대원.slice(0,3).map((c: any) => c.id);
    w.S.최고층 = 12; w.S.금화 = 6220; w.S.가방.별가루 = 315; w.S.진행 = false; w.S.탭 = "run"; w.화면(); w.맵그리기(); });
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: "engine/docs/ui-ask/탑맵.png" as `${string}.png` });
  await page.evaluate(() => (document.querySelector('#맵 [data-f="10"]') as HTMLElement).click());
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: "engine/docs/ui-ask/탑맵-출발.png" as `${string}.png` });
  console.log("찍음: 탑맵.png · 탑맵-출발.png");
} finally { await 창.browser.close(); await 창.close?.(); }
