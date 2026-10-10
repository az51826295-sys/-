/**
 * **뽑기가 설계를 안 깨는가** (10-11). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_뽑기_시험.mts [--sabotage]
 *
 * 이 자가 지키는 것은 **대전제 하나**다 — 뽑기는 **고를 수 있는 것**(동료)과 재료만 준다.
 * **레벨도 능력치도 팔지 않는다.** 그게 무너지면 "장비를 만들 이유"가 사라지고
 * 10·20·30층 벽이 전부 같이 무너진다.
 *
 * 그래서 천 번을 돌려 놓고 **능력치가 1이라도 올랐는지**를 본다. 글이 아니라 숫자로.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(본)); };

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));

  if (process.argv.includes("--sabotage")) await page.evaluate(() => {
    // 심은 고장: 뽑기가 레벨을 준다(= 대전제를 깨는 꼴)
    const w = window as any, 원 = w.한번뽑기;
    w.한번뽑기 = () => { const r = 원(); w.S.대원[0].레벨 += 1; return r; };
  });

  const 본 = await page.evaluate(() => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    try { localStorage.clear(); } catch { /* 없어도 된다 */ }

    const c = w.S.대원[0];
    const 앞 = { 레벨: c.레벨, 체력: w.최대체력(c), 공격: w.공격력(c), 방어: w.방어력(c),
                 대원수: w.S.대원.length, 최고층: w.S.최고층 };

    /* ① 값이 모자라면 못 돌린다 */
    w.S.가방.별가루 = 10;
    const 모자람 = w.뽑기(1);

    /* ② 값을 치르면 그만큼 준다 */
    w.S.가방.별가루 = 1000;
    const 한번 = w.뽑기(1);
    const 한번쓴 = 1000 - w.S.가방.별가루;
    w.S.가방.별가루 = 10000;
    const 열번 = w.뽑기(10);
    const 열번쓴 = 10000 - w.S.가방.별가루;

    /* ③ **천 번 돌린다** — 등급 분포와, 능력치가 올랐는지 */
    w.S.가방.별가루 = 9_999_999;
    w.S.뽑은수 = 0; w.S.조각 = 0;
    const 셈: Record<string, number> = { SSR: 0, SR: 0, R: 0 };
    const 종류: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const r = w.한번뽑기();
      셈[r.급] = (셈[r.급] ?? 0) + 1;
      종류[r.종류] = (종류[r.종류] ?? 0) + 1;
    }
    const 뒤 = { 레벨: c.레벨, 체력: w.최대체력(c), 공격: w.공격력(c), 방어: w.방어력(c),
                 대원수: w.S.대원.length, 최고층: w.S.최고층 };

    /* ④ 천장 — 30번째마다 SSR */
    w.S.뽑은수 = 0;
    const 천장들: number[] = [];
    for (let i = 1; i <= 90; i++) { const r = w.한번뽑기(); if (i % 30 === 0 && r.급 === "SSR") 천장들.push(i); }

    /* ⑤ 이미 가진 동료가 또 나오면 조각으로 */
    const 동료들 = w.뽑기동료();
    let 겹침 = null;
    if (동료들.length) {
      // 뽑기 동료를 전부 넣어 둔다 → 다음 SSR/SR 은 반드시 조각이어야 한다
      for (const d of 동료들) if (!w.S.대원.some((x: any) => x.키 === d.키)) w.S.대원.push(w.대원만들기(d.키, 1));
      const 조각앞 = w.S.조각, 수앞 = w.S.대원.length;
      for (let i = 0; i < 300; i++) w.한번뽑기();
      겹침 = { 조각늘음: w.S.조각 > 조각앞, 대원안늘음: w.S.대원.length === 수앞 };
    }

    return { 앞, 뒤, 모자람, 한번, 한번쓴, 열번수: 열번?.length ?? 0, 열번쓴, 셈, 종류, 천장들, 겹침,
             값: w.뽑기값, 동료수: 동료들.length };
  });

  console.log(`  천 번 — SSR ${본.셈.SSR} · SR ${본.셈.SR} · R ${본.셈.R}`);
  console.log(`  나온 종류 — ${Object.entries(본.종류).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`  뽑기 동료 ${본.동료수}명\n`);

  재기("별가루가 모자라면 안 돌아간다", 본.모자람 === null, 본.모자람);
  재기("1회에 150을 쓴다", 본.한번쓴 === 본.값.한번, { 쓴: 본.한번쓴, 값: 본.값.한번 });
  재기("10연에 1,350을 쓰고 열 개가 나온다", 본.열번쓴 === 본.값.열번 && 본.열번수 === 10, { 쓴: 본.열번쓴, 수: 본.열번수 });

  /* **이 자의 심장** — 뽑기는 레벨도 능력치도 주지 않는다 */
  재기("뽑기가 레벨을 올리지 않는다", 본.뒤.레벨 === 본.앞.레벨, { 앞: 본.앞.레벨, 뒤: 본.뒤.레벨 });
  재기("뽑기가 능력치를 올리지 않는다",
    본.뒤.체력 === 본.앞.체력 && 본.뒤.공격 === 본.앞.공격 && 본.뒤.방어 === 본.앞.방어, { 앞: 본.앞, 뒤: 본.뒤 });
  재기("뽑기가 층을 열지 않는다", 본.뒤.최고층 === 본.앞.최고층, { 앞: 본.앞.최고층, 뒤: 본.뒤.최고층 });

  재기("R 에 조각·재료·금화가 섞여 나온다",
    (본.종류.조각 ?? 0) > 0 && (본.종류.재료 ?? 0) > 0 && (본.종류.금화 ?? 0) > 0, 본.종류);

  /* 뽑기 동료가 **아직 하나도 없다.** 그러면 SSR·SR 이 전부 R 로 떨어지므로
     확률과 천장을 잴 수가 없다. **침묵하지 않고 그대로 적는다** — 0 은 "못 본다"일 수 있다. */
  if (본.동료수 === 0) {
    console.log("  ⚠ 뽑기 동료가 0명이다 — SSR·SR 이 전부 R 로 떨어진다.");
    console.log("     도감에 뽑기 등급을 단 동료가 들어와야 뽑기가 완성된다.");
    console.log("     그때까지 아래 넷은 **잴 수 없어서 건너뛴다**(통과가 아니다):");
    console.log("       · SSR 이 5% 언저리다 · SR 이 25% 언저리다");
    console.log("       · 천장이 30번째마다 SSR 을 준다 · 겹치면 조각이 된다");
  } else {
    // 확률 — 천 번이면 SSR 50±25, SR 250±50 쯤. 넉넉히 본다(난수라 딱 맞지 않는다)
    재기("SSR 이 5% 언저리다", 본.셈.SSR >= 20 && 본.셈.SSR <= 100, 본.셈);
    재기("SR 이 25% 언저리다", 본.셈.SR >= 170 && 본.셈.SR <= 330, 본.셈);
    재기("천장이 30번째마다 SSR 을 준다", 본.천장들.length === 3, 본.천장들);
    if (본.겹침) 재기("이미 가진 동료가 또 나오면 조각이 된다", 본.겹침.조각늘음 && 본.겹침.대원안늘음, 본.겹침);
  }
} finally { await 창.browser.close(); await 창.close?.(); }
console.log(나쁨 === 0 ? "전부 통과" : `실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
