/**
 * **한 층에 적이 연달아 나오는가** (10-09 사장님 "층마다 여러 적이 연달아 등장해"). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_무리_시험.mts [--sabotage]
 *
 * 재는 것: 무리가 실제로 **갈라져** 나오나 · 한 무리가 두 마리를 안 넘나 ·
 * 무리 사이에 체력이 **안 차나**(차면 연달아 나오는 뜻이 없다) · 보스는 혼자 나오나 ·
 * 마지막 무리를 눕혀야 층이 넘어가나.
 *
 * 게임 안의 한턴() 을 그대로 돌린다 — 따로 셈을 베끼면 게임과 다른 것을 재게 된다.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(본)); };

type 무리기록 = { 무리: number; 마리: number; 체력: number };
type 층기록 = { 층: number; 무리들: 무리기록[]; 턴: number; 넘어감: boolean };

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));

  if (process.argv.includes("--sabotage")) await page.evaluate(() => {
    // 심은 고장: 무리를 안 나누고 한 번에 다 쏟는다(= 고치기 전 꼴). 자가 침묵하면 자가 눈이 먼 것이다.
    const w = window as any, 원 = w.적만들기;
    w.적만들기 = (무리 = 0) => { 원(무리); w.S.무리수 = 1; };
  });

  const 본: 층기록[] = await page.evaluate(() => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    return [1, 4, 7, 10].map((층) => {
      // 10-09: 층은 이제 스스로 안 오른다. **한 판이 끝나는 것**(깸이 1 느는 것)으로 본다.
      w.S.층 = 층; w.S.단계 = Math.floor((층 - 1) / 10) + 1; w.S.사냥층 = 층; w.S.진행 = true; w.S.쉼 = 0;
      w.S.깸 = w.S.깸 ?? {}; const 앞깸 = w.S.깸[층] ?? 0;
      w.전투준비(); w.적만들기();
      const 무리들: Array<{ 무리: number; 마리: number; 체력: number }> = [];
      let 앞 = -1, 턴 = 0;
      while ((w.S.깸[층] ?? 0) === 앞깸 && 턴 < 4000) {
        if (w.S.무리 !== 앞 && w.적들.length) {
          앞 = w.S.무리;
          const p = w.S.대원.filter((c: any) => w.S.파티.includes(c.id));
          const 체력 = Math.round(p.reduce((a: number, c: any) => a + Math.max(0, c.hp) / w.최대체력(c), 0) / p.length * 100);
          무리들.push({ 무리: 앞, 마리: w.적들.length, 체력 });
        }
        w.한턴(); 턴++;
      }
      return { 층, 무리들, 턴, 넘어감: (w.S.깸[층] ?? 0) > 앞깸 };
    });
  });

  for (const r of 본) console.log(`  ${r.층}층 — ${r.무리들.map((m) => `${m.마리}마리(체력 ${m.체력}%)`).join(" → ")} · ${r.턴}턴`);
  const 일반 = 본.filter((r) => r.층 % 10 !== 0);
  const 보스 = 본.find((r) => r.층 % 10 === 0);

  재기("일반 층은 무리가 둘 이상 연달아 나온다", 일반.length > 0 && 일반.every((r) => r.무리들.length >= 2), 일반.map((r) => [r.층, r.무리들.length]));
  재기("한 무리는 두 마리를 안 넘는다", 본.every((r) => r.무리들.every((m) => m.마리 <= 2)), 본.map((r) => r.무리들.map((m) => m.마리)));
  재기("보스는 혼자 나온다", !!보스 && 보스.무리들.length === 1 && 보스.무리들[0].마리 === 1, 보스);
  재기("모든 층에서 한 판이 끝난다", 본.every((r) => r.넘어감), 본.map((r) => [r.층, r.넘어감]));
  // **핵심**: 무리 사이에 체력이 차면 "연달아"에 뜻이 없다 — 뒤 무리가 더 무거워야 한다
  재기("무리 사이에 체력이 안 찬다",
    일반.every((r) => r.무리들.every((m, i) => i === 0 || m.체력 <= r.무리들[i - 1].체력)),
    일반.map((r) => r.무리들.map((m) => m.체력)));
} finally { await 창.browser.close(); await 창.close?.(); }
console.log(나쁨 === 0 ? "\n전부 통과" : `\n실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
