/**
 * **잿빛 원정대 스토어 그림** (10-08). 모델 0 · 값 0.
 *   npx tsx engine/tools/ash_store_shots.mts
 * 배포된 게임을 360×640 · 3배로 열어 1080×1920 스크린샷 4장(길드·전투·캐릭터·대장간)과 1024×500 소개 그림을 찍는다.
 * 태블릿 칸도 9:16 만 받으니 같은 4장을 쓴다(09-13 로키 교훈).
 */
import { mkdirSync, readFileSync } from "node:fs";
import { openHeadless } from "../../src/lib/video/headless";

// 올리기 전에 고친 것을 보려면 ASH_URL 로 로컬 주소를 준다(예: http://127.0.0.1:8123/ash/index.html).
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html?lang=ko";
const 나올 = "C:/Users/az518/Desktop/로키-도트/스토어/잿빛원정대";
mkdirSync(나올, { recursive: true });
const 창 = await openHeadless({ width: 360, height: 640 });
if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 3 });
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 30000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2500));
  // 보여 줄 만한 판: 넷이 다 있고, 장비·재료가 조금 있는 6층
  await page.evaluate(() => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    if (!w.S.대원.some((c: any) => c.키 === "흑마법사")) w.S.대원.push(w.대원만들기("흑마법사", 12));
    for (const c of w.S.대원) c.레벨 = 12 + Math.floor(Math.random() * 4);
    w.S.파티 = w.S.대원.map((c: any) => c.id);
    w.S.최고층 = 12; w.S.층 = 16; w.S.단계 = 2; w.S.금화 = 8420;
    Object.assign(w.S.가방, { 파편: 34, 잔혼: 17, 수호핵: 2, 별가루: 315 });
    w.만들기("가죽갑옷"); w.장착(w.S.가방.장비[0].id, w.S.대원[0].id);
    w.만들기("철검"); w.장착(w.S.가방.장비[1].id, w.S.대원[1].id);
    w.적만들기(); w.전투준비();
  });
  const 찍기 = async (탭: string, 이름: string, 준비?: () => Promise<void>) => {
    await page.evaluate((탭) => (document.querySelector(`.tab[data-t="${탭}"]`) as HTMLElement).click(), 탭);
    if (준비) await 준비();
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: `${나올}/${이름}.png` });
    console.log(`  ${이름}.png`);
  };
  await 찍기("hall", "1-길드");
  await 찍기("run", "2-전투", async () => {
    // 글이 몇 줄 쌓이고 빛이 터지는 순간 — 적은 단단하게 세워 둔다(첫 판은 찍기 전에 다 쓰러져 빈 칸이 찍혔다)
    await page.evaluate(() => { const w = window as any; w.S.층 = 15; w.적만들기(); w.전투준비();
      for (const e of w.적들) { e.최대 = e.hp = 999999; } for (const e of w.적들) e.hp = Math.floor(e.최대 * .7); });
    for (let i = 0; i < 14; i++) { await page.evaluate(() => (window as any).한턴()); await new Promise((r) => setTimeout(r, 120)); }
    await new Promise((r) => setTimeout(r, 160));
  });
  await 찍기("crew", "3-캐릭터");
  await 찍기("forge", "4-대장간");

  // 소개 그림 1024×500 — 같은 그림 파일로 HTML 을 짜서 찍는다
  const 그림 = (f: string) => "data:image/png;base64," + readFileSync(`C:/Users/az518/Desktop/ai-workforce/public/ash/art/${f}.png`).toString("base64");
  const 소개 = await 창.browser.newPage();
  await 소개.setViewport({ width: 1024, height: 500, deviceScaleFactor: 1 });
  await 소개.setContent(`<html><body style="margin:0;width:1024px;height:500px;overflow:hidden;background:#1a1420;font-family:'Malgun Gothic',sans-serif">
    <div style="position:absolute;inset:0;background:url(${그림("camp")}) center 38%/1024px auto no-repeat;image-rendering:pixelated;filter:brightness(.72)"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(26,20,32,.92) 0%,rgba(26,20,32,.55) 45%,rgba(26,20,32,0) 70%)"></div>
    <img src="${그림("c-knight")}" style="position:absolute;right:250px;bottom:18px;width:272px;image-rendering:pixelated">
    <img src="${그림("c-darkmage")}" style="position:absolute;right:120px;bottom:30px;width:204px;image-rendering:pixelated;filter:brightness(.85)">
    <img src="${그림("c-healer")}" style="position:absolute;right:20px;bottom:30px;width:204px;image-rendering:pixelated;filter:brightness(.8)">
    <div style="position:absolute;left:64px;top:150px;color:#f2b45a;font-size:76px;font-weight:700;letter-spacing:4px;text-shadow:4px 4px 0 #000">잿빛 원정대</div>
    <div style="position:absolute;left:68px;top:262px;color:#f1e4c8;font-size:28px;text-shadow:2px 2px 0 #000">탑을 오르는 원정대 · 자동 턴제 RPG</div>
  </body></html>`, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 400));
  await 소개.screenshot({ path: `${나올}/소개-1024x500.png` });
  console.log("  소개-1024x500.png");
} finally {
  await 창.browser.close(); await 창.close?.();
}
