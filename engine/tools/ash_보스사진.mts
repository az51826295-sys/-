/**
 * **관문 보스가 판 안에 들어가는가** (10-11). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_보스사진.mts
 *
 * 10-11 에 거인을 221도트로 넣었더니 **다리만 보였다.** 주문의 "사람의 180%" 를
 * 그대로 도트로 옮긴 탓인데, 판에 이미 선 것들(골렘 122 · 기사 136)을 안 보고 정한 값이었다.
 * 그래서 **사진 한 장과 함께 넘침을 숫자로** 남긴다 — 그림의 위가 판 위로 올라가면 넘친 것이다.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
let 나쁨 = 0;
const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));
  for (const 층 of [5, 15, 25, 35, 45, 55, 65, 85, 95]) {
    const 잰 = await page.evaluate((f: number) => {
      const w = window as any;
      for (let i = 1; i < 9999; i++) clearInterval(i);
      for (const k of ["검사", "회복술사", "전투사제"]) if (!w.S.대원.some((c: any) => c.키 === k)) w.S.대원.push(w.대원만들기(k, 40));
      w.S.파티 = w.S.대원.slice(0, 4).map((c: any) => c.id);
      w.S.최고층 = f; w.S.층 = f; w.S.탭 = "run"; w.S.진행 = true;
      w.전투준비(); w.적만들기(0); w.화면();
      const 판 = document.querySelector("#board") as HTMLElement;
      const 네 = 판?.getBoundingClientRect();
      /* 그림 칸은 캔버스 안에 그려지므로 DOM 으로는 못 잰다 — **그림 원본 크기**와
         판 높이를 같이 돌려주고, 바깥에서 견준다. */
      const 적 = (w as any).S.적이름 ?? null;
      return { 판높이: Math.round(네?.height ?? 0), 적 };
    }, 층);
    const 몹 = await page.evaluate(() => {
      const w = window as any;
      return (w.적들 ?? []).map((a: any) => ({ 이름: a.이름, 그림: a.그림 }));
    });
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: `engine/docs/ui-ask/보스-${층}층.png` as `${string}.png` });
    console.log(`${층}층 · 판높이 ${잰.판높이}px · ${몹.map((m: any) => m.이름).join(", ") || "(못 읽음)"}`);
    if (!잰.판높이) 나쁨++;
  }
} finally { await 창.browser.close(); await 창.close?.(); }
console.log(나쁨 === 0 ? "찍음" : `판을 못 찾음 ${나쁨}건`);
