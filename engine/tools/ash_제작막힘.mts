/**
 * **왜 안 만들어지나** (10-11). 모델 0 · 값 0.
 *   ASH_URL=... npx tsx engine/tools/ash_제작막힘.mts
 *
 * 체감 자가 10층 보스를 301판 돌고도 T2 를 못 만들었다. 재료는 넉넉할 텐데 거절당한다 —
 * **거절한 쪽이 무엇을 모자라다고 하는지** 직접 묻는다. 짐작하지 않는다.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";

const 창 = await openHeadless({ width: 390, height: 844, protocolTimeout: 20 * 60_000 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));

  const 본 = await page.evaluate(() => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    w.requestAnimationFrame = () => 0;
    try { localStorage.clear(); } catch { /* */ }

    // 10층 보스를 서른 판 돈다 — 손으로 재료를 심지 않고 **게임이 주는 대로** 받는다
    /* 10-11: 여기서 `최고층` 만 손으로 올려 뒀더니 판이 끝날 때 **열린층() 이 1 로 다시 계산**했다
       — 1~9층 자격을 안 채웠기 때문이다. 실제 판에서는 올라오면서 채워져 있다.
       그래서 **자격을 채운 상태**를 만들어 준다(이건 판정이 아니라 조사다). */
    w.S.깸 = {}; for (let f = 1; f <= 19; f++) w.S.깸[f] = w.필요판(f);
    w.S.보스깸 = [10];
    w.S.최고층 = w.열린층(); w.S.층 = 10; w.S.사냥층 = 10; w.S.단계 = 1; w.S.자동오름 = false;
    w.S.진행 = true; w.전투준비(); w.적만들기();
    for (const c of w.S.대원) c.레벨 = 19;
    let 턴 = 0;
    const 깸앞 = w.S.깸[10];
    while (턴 < 300_000 && (w.S.깸?.[10] ?? 0) - 깸앞 < 30) { w.한턴(); 턴++; }

    const 가방 = Object.fromEntries(Object.keys(w.재료이름).map((k) => [k, w.S.가방[k] ?? 0]));
    const 줄: any[] = [];
    for (const [k, r] of Object.entries(w.레시피) as any[]) {
      줄.push({ 키: k, 이름: r.이름, 열림: r.열림, 금화: r.금화, 모자람: w.모자람(k) });
    }
    return { 턴, 깸: w.S.깸?.[10] ?? 0, 금화: w.S.금화, 최고층: w.S.최고층, 가방, 줄,
             파티수: w.S.파티.length, 대원수: w.S.대원.length };
  });

  console.log(`10층 ${본.깸}판(자격 채운 뒤 30판 더) · ${본.턴}턴 · 금화 ${본.금화.toLocaleString()} · 최고층 ${본.최고층}`);
  console.log(`가방 — ${Object.entries(본.가방).filter(([, v]: any) => v > 0).map(([k, v]) => `${k} ${v}`).join(" · ") || "(빔)"}`);
  console.log(`대원 ${본.대원수}명 · 파티 ${본.파티수}명\n`);
  for (const r of 본.줄)
    console.log(`${String(r.열림).padStart(3)}  ${r.이름.padEnd(14)} ${String(r.금화).padStart(9)}  `
      + (r.모자람.length ? `모자람: ${JSON.stringify(r.모자람)}` : "**만들 수 있다**"));
} finally { await 창.browser.close(); await 창.close?.(); }
