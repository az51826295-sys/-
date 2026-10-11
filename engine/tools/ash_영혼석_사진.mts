/** 영혼석 칸 한 장 (10-11). 모델 0 · 값 0. */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));
  await page.evaluate(() => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    w.S.영혼석 = { 가진: Object.fromEntries(w.영혼석들().map((k: string) => [k, 1])),
                   낀액티브: ["폭풍", "역천"], 낀패시브: "재기" };
    w.S.가방탭 = "영혼석"; w.S.탭 = "hall"; w.화면(); w.가방창();
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: "engine/docs/ui-ask/영혼석칸.png" as `${string}.png` });
  console.log("찍음: 영혼석칸.png");
} finally { await 창.browser.close(); await 창.close?.(); }
