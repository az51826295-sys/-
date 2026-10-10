/**
 * **맨땅에서 실제로 몇 판·몇 분 걸리나** (10-11 사장님 "지금 좀 많이 어렵네").
 *   ASH_URL=... npx tsx engine/tools/ash_체감.mts [끝층=22]
 *
 * ash_막힘_시험 은 장비를 **넉넉히 주고** 잰다 — "장비가 있으면 넘는가" 를 보는 자다.
 * 이 자는 **아무것도 안 주고** 실제처럼 돌린다: 떨어진 재료로만 만들고, 모자라면 시장에서 산다.
 * 그래서 "10층을 넘기까지 **몇 판**, 실제로 **몇 분**" 이 나온다. 체감은 여기서 나온다.
 *
 * 한 판의 실제 시간은 게임의 턴 간격(420ms)과 장면 넘김으로 정해진다 — 그대로 곱해 적는다.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
const 끝층 = Number(process.argv[2] ?? 22);

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));

  const 본 = await page.evaluate((끝층: number) => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    (window as any).requestAnimationFrame = () => 0;
    try { localStorage.clear(); } catch { /* 없어도 된다 */ }

    /* 맨땅 — 아무것도 안 심는다 */
    w.S.대원.length = 0; w.S.파티.length = 0;
    for (const k of ["기사", "검사", "회복술사"]) w.S.대원.push(w.대원만들기(k));
    w.S.파티 = w.S.대원.map((c: any) => c.id);
    w.S.가방.장비 = []; w.S.가방.약 = 0; w.S.약수 = 0;
    for (const k of Object.keys(w.재료이름)) w.S.가방[k] = 0;
    w.S.깸 = {}; w.S.보스깸 = []; w.S.금화 = 0; w.S.장날 = null; w.S.산것 = {};
    w.S.층 = 1; w.S.단계 = 1; w.S.사냥층 = 1; w.S.자동오름 = true; w.S.쉼 = 0;
    w.S.최고층 = w.열린층(); w.S.진행 = true;
    w.전투준비(); w.적만들기();

    /** 만들 수 있는 것은 다 만들고, 슬롯마다 가장 좋은 것을 낀다. 재료가 모자라면 **시장에서 산다.** */
    const 값 = (키: string) => Object.values(w.레시피[키].효과 ?? {}).reduce((a: number, b: any) => a + Number(b), 0);
    let 산것 = 0;
    const 꾸미기 = () => {
      for (const [키, m] of Object.entries(w.매대) as [string, any][]) {
        // 하나만 모자라서 막혔을 때만 산다(값이 싼 것부터)
        for (const [rk, r] of Object.entries(w.레시피) as [string, any][]) {
          if (w.S.최고층 < r.열림) continue;
          const 없 = Object.entries(r.재료).filter(([k, n]) => (w.S.가방[k] ?? 0) < (n as number));
          if (없.length === 1 && 없[0][0] === 키 && w.S.금화 >= m.값 && w.남은수(키) > 0) {
            if (w.사기(키)) 산것++;
          }
        }
      }
      for (const 슬롯 of ["무기", "갑옷", "장신구"]) {
        const 고를 = Object.keys(w.레시피)
          .filter((k) => w.레시피[k].슬롯 === 슬롯 && !w.모자람(k).length)
          .sort((a, b) => 값(b) - 값(a))[0];
        if (!고를) continue;
        for (const c of w.S.대원) {
          const 낀 = w.S.가방.장비.find((x: any) => x.누구 === c.id && w.레시피[x.키].슬롯 === 슬롯);
          if (낀 && 낀.키 === 고를) continue;
          if (w.만들기(고를)) { const t = w.S.가방.장비[w.S.가방.장비.length - 1]; w.장착(t.id, c.id); }
        }
      }
    };

    const 길: any[] = [];
    let 턴 = 0, 층턴 = 0, 앞층 = 1, 층전멸 = 0, 판앞 = 0, 층판 = 0;
    while (턴 < 900_000) {
      const 쉼앞 = w.S.쉼;
      w.한턴(); 턴++; 층턴++;
      if (w.S.쉼 > 쉼앞) 층전멸++;
      const 깸 = w.S.깸?.[w.S.층] ?? 0;
      if (깸 !== 판앞) { 판앞 = 깸; 층판++; 꾸미기(); }
      if (w.S.층 !== 앞층) {
        길.push({ 층: 앞층, 판: 층판, 전멸: 층전멸, 턴: 층턴 });
        앞층 = w.S.층; 층턴 = 0; 층전멸 = 0; 층판 = 0; 판앞 = w.S.깸?.[w.S.층] ?? 0;
        꾸미기();
        if (w.S.층 > 끝층) break;
      }
      if (!w.S.자동오름) { 길.push({ 층: 앞층, 판: 층판, 전멸: 층전멸, 턴: 층턴, 막힘: true }); break; }
    }
    const 낀것 = w.S.가방.장비.filter((x: any) => x.누구 != null).map((x: any) => w.레시피[x.키].이름);
    return { 길, 턴, 닿은층: w.S.층, 막힘: !w.S.자동오름, 금화: w.S.금화, 산것, 낀것 };
  }, 끝층);

  const 초 = (턴: number) => (턴 * 0.42);
  console.log(`\n맨땅에서 ${본.닿은층}층까지 — 총 ${본.턴}턴 ≈ **${(초(본.턴)/60).toFixed(0)}분**`
    + `${본.막힘 ? ` · **${본.닿은층}층에서 막힘**` : ""}`);
  console.log(`  시장에서 산 것 ${본.산것}번 · 남은 금화 ${본.금화}`);
  console.log(`  낀 장비: ${본.낀것.join(", ") || "없음"}\n`);
  console.log("   층    판   전멸     턴    분");
  let 누적 = 0;
  for (const r of 본.길 as any[]) {
    누적 += r.턴;
    if (r.층 % 5 === 0 || r.층 === 1 || r.막힘 || r.전멸 > 0)
      console.log(`  ${String(r.층).padStart(3)} ${String(r.판).padStart(5)} ${String(r.전멸).padStart(5)} ${String(r.턴).padStart(6)} ${(초(r.턴)/60).toFixed(1).padStart(6)}${r.막힘 ? "  ← 막힘" : ""}`);
  }
  console.log(`\n  10층까지 누적 ≈ ${(초((본.길 as any[]).filter((r) => r.층 <= 10).reduce((a, r) => a + r.턴, 0))/60).toFixed(0)}분`);
} finally { await 창.browser.close(); await 창.close?.(); }
