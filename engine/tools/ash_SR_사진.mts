/** 로건·이브가 판에 선 모습과 카드 한 장씩 (10-11). 모델 0 · 값 0. */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html?lang=ko";
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
    for (const k of ["성기사", "암살자"]) if (!w.S.대원.some((c: any) => c.키 === k)) w.S.대원.push(w.대원만들기(k, 20));
    const 파 = ["기사", "성기사", "암살자", "전투사제"].map((k) => {
      let c = w.S.대원.find((x: any) => x.키 === k);
      if (!c) { c = w.대원만들기(k, 20); w.S.대원.push(c); }
      c.레벨 = 20; return c;
    });
    w.S.파티 = 파.map((c: any) => c.id);
    w.S.최고층 = 20; w.S.층 = 20; w.S.탭 = "run"; w.S.진행 = true;
    w.전투준비(); w.적만들기(0); w.화면();
  });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: "engine/docs/ui-ask/SR-판.png" as `${string}.png` });
  // 카드 한 장 — 기술·특성 설명이 실제로 그려지는지
  await page.evaluate(() => {
    const w = window as any;
    w.S.탭 = "crew"; w.S.보는대원 = w.S.대원.find((c: any) => c.키 === "성기사").id; w.화면();
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: "engine/docs/ui-ask/SR-로건카드.png" as `${string}.png` });
  console.log("찍음: SR-판.png · SR-로건카드.png");
} finally { await 창.browser.close(); await 창.close?.(); }
