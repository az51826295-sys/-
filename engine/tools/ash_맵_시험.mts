/**
 * **탑 맵이 되는가** (10-09). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8123/ash/index.html npx tsx engine/tools/ash_맵_시험.mts
 * 맵이 뜨나 · 꼭대기가 위인가 · 깬 층까지만 있나 · 누르면 출전 고르는 창이 뜨나 · 떠나면 맵이 사라지나.
 */
import { openHeadless } from "../../src/lib/video/headless";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(본)); };
const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));
  await page.evaluate(() => { const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    w.S.최고층 = 7; w.S.진행 = false; w.S.탭 = "run"; w.화면(); w.맵그리기(); });
  await new Promise((r) => setTimeout(r, 500));

  const 맵 = await page.evaluate(() => {
    const el = document.querySelector("#맵");
    const 칸들 = Array.from(document.querySelectorAll("#맵 [data-f]")).map((x) => Number((x as HTMLElement).dataset.f));
    return el ? { 보임: getComputedStyle(el).display !== "none", 칸들, 넘침: el.scrollHeight > el.clientHeight } : null;
  });
  재기("맵이 보인다", !!맵?.보임, 맵);
  재기("깬 층 + 한 층까지만 있다", JSON.stringify(맵?.칸들) === JSON.stringify([8,7,6,5,4,3,2,1]), 맵?.칸들);
  재기("맨 위가 가장 높은 층", 맵?.칸들?.[0] === 8, 맵?.칸들?.[0]);

  await page.evaluate(() => (document.querySelector('#맵 [data-f="5"]') as HTMLElement).click());
  await new Promise((r) => setTimeout(r, 400));
  const 창열림 = await page.evaluate(() => {
    const d = document.querySelector("#덮개");
    return d ? { 글: (d.textContent ?? "").slice(0, 40), 동료: d.querySelectorAll("[data-넣]").length, 되돌이: !!d.querySelector("#되돌이") } : null;
  });
  재기("층을 누르면 출발 창이 뜬다", !!창열림, 창열림);
  재기("출전 고를 동료가 있다", (창열림?.동료 ?? 0) > 0, 창열림);

  const 뺐다 = await page.evaluate(() => {
    const w = window as any; const 앞 = w.S.파티.length;
    (document.querySelector("#덮개 [data-넣]") as HTMLElement).click();
    return { 앞, 뒤: w.S.파티.length };
  });
  재기("출전 넣고 빼기가 먹는다", 뺐다.앞 !== 뺐다.뒤, 뺐다);

  await new Promise((r) => setTimeout(r, 300));
  const 떠남 = await page.evaluate(() => {
    const w = window as any;
    if (!w.S.파티.length) (document.querySelector("#덮개 [data-넣]") as HTMLElement).click();
    (document.querySelector("#덮개 #되돌이") as HTMLElement).click();
    return { 층: w.S.층, 사냥층: w.S.사냥층, 진행: w.S.진행, 덮개: !!document.querySelector("#덮개") };
  });
  재기("되돌이로 떠난다", 떠남.층 === 5 && 떠남.사냥층 === 5 && 떠남.진행 === true && !떠남.덮개, 떠남);
  await new Promise((r) => setTimeout(r, 300));
  재기("떠나면 맵이 사라진다", await page.evaluate(() => getComputedStyle(document.querySelector("#맵")!).display === "none"));
} finally { await 창.browser.close(); await 창.close?.(); }
console.log(나쁨 === 0 ? "\n전부 통과" : `\n실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
