/**
 * **그림이 없는 칸을 전부 센다** (10-11 사장님 "그림 넣어 모든거"). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_그림_빠짐.mts
 *
 * 10구간·장비 20종·재료 13종·영혼석 6종까지 늘어나는 동안 **그림은 따라오지 못했다.**
 * 눈으로 훑으면 반드시 빠뜨리므로, 게임이 **실제로 찾는 이름**을 전부 모아
 * manifest 에 있는 것과 맞대어 본다. 짐작하지 않는다 — 게임의 표에서 읽는다.
 */
import { readFileSync } from "node:fs";
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
const 있는것 = new Set<string>(JSON.parse(readFileSync("public/ash/art/manifest.json", "utf8")));

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));

  const 쓰는것 = await page.evaluate(() => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    const 줄: Array<{ 갈래: string; 무엇: string; 이름: string }> = [];
    // 동료
    for (const [k, d] of Object.entries(w.도감) as any[]) 줄.push({ 갈래: "동료", 무엇: k, 이름: d.그림 });
    // 몹·보스
    for (const g of w.구간들 as any[]) {
      for (const m of g.몹) 줄.push({ 갈래: "몹", 무엇: m.이름, 이름: m.그림 });
      줄.push({ 갈래: "보스", 무엇: g.보스.이름, 이름: g.보스.그림 });
    }
    // 재료 — 가방이 `m-<키>` 로 찾는다
    for (const k of Object.keys(w.재료이름)) 줄.push({ 갈래: "재료", 무엇: w.재료이름[k], 이름: "m-" + k });
    // 장비 — 물건아이콘 표에 있는 것만 그림이 뜬다
    for (const [k, r] of Object.entries(w.레시피) as any[])
      줄.push({ 갈래: "장비", 무엇: r.이름, 이름: (w.물건아이콘 ?? {})[k] ?? "(표에 없음)" });
    // 영혼석 — 지금은 아예 아이콘을 안 쓴다
    for (const [k, d] of Object.entries(w.영혼석표) as any[])
      줄.push({ 갈래: "영혼석", 무엇: d.이름, 이름: (w.영혼석아이콘 ?? {})[k] ?? "(표에 없음)" });
    return 줄;
  });

  /* 아이콘은 manifest 에 `icon/` 을 달고 들어 있다 — 그 접두사를 빼고 보면
     **이미 있는 그림 열넷이 없다고 나온다**(10-11에 실제로 그랬다). */
  const 있나 = (n: string) => 있는것.has(n) || 있는것.has("icon/" + n);
  const 빠진 = 쓰는것.filter((r) => r.이름 === "(표에 없음)" || !있나(r.이름));
  const 갈래별 = new Map<string, typeof 빠진>();
  for (const r of 빠진) 갈래별.set(r.갈래, [...(갈래별.get(r.갈래) ?? []), r]);

  console.log(`쓰는 그림 ${쓰는것.length}개 · manifest ${있는것.size}개 · **빠진 것 ${빠진.length}개**\n`);
  for (const [갈래, 들] of 갈래별) {
    console.log(`── ${갈래} ${들.length}개`);
    for (const r of 들) console.log(`   ${r.무엇.padEnd(18)} ${r.이름}`);
  }
  console.log(빠진.length === 0 ? "\n전부 통과 — 빠진 그림이 없다." : `\n실패 ${빠진.length}건`);
  process.exit(빠진.length === 0 ? 0 : 1);
} finally { await 창.browser.close(); await 창.close?.(); }
