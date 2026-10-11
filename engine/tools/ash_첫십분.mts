/**
 * **처음 온 사람의 첫 십 분** (10-12 사장님·제미나이). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_첫십분.mts [--sabotage]
 *
 * 자 열여섯이 전부 통과하는데 **아무도 이 게임을 해 본 적이 없다.**
 * 내 자들은 전부 깊은 칸만 본다 — "T5 가 50 층을 여나", "관문이 벽인가".
 * 테스터 열두 명이 붙기 직전인데, 그 사람들이 겪는 것은 **첫 십 분**이고 거기엔 자가 없다.
 *
 * **못 재는 것은 안 잰다.** 이탈률·첫 클릭까지의 시간·"장착 비율 85%" 는 **사람이 있어야** 나온다.
 * 헤드리스 자엔 사람이 없고, 이 게임은 서버가 없어 이벤트를 모을 데도 없다(localStorage 한 벌).
 * 그건 테스터가 붙은 뒤 Play Console 이 볼 몫이다.
 *
 * **대신 사람 없이 재지는 것**을 잰다. 시간이 아니라 **손가락 수**와 **길잡이 글**이다:
 *   ① 맨땅에서 첫 화면이 뜨는가 · 거기 무엇이 적혀 있는가
 *   ② **아무것도 안 누르고 두면** 무슨 일이 일어나는가 (진행이 꺼진 채로 시작한다)
 *   ③ 첫 전투까지 **몇 번 눌러야** 하는가 — 그 길이 화면에 적혀 있는가
 *   ④ 첫 전멸(처음 막히는 곳)이 몇 분째인가
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(본)); };
const 적기 = (n: string, 값: unknown) => console.log(`     ${n} — ${JSON.stringify(값)}`);

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);

  /* **맨땅에서 연다.** 저장이 남아 있으면 "처음 온 사람" 이 아니다 — 이 자의 전부가 거기 달렸다. */
  await page.goto(주소, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* */ } });
  const 뜬때 = Date.now();
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));
  const 로딩초 = (Date.now() - 뜬때) / 1000;

  if (process.argv.includes("--sabotage")) await page.evaluate(() => {
    /* 심은 고장: 첫 화면의 길잡이 글을 지운다. 게임은 멀쩡히 돌고 자 열여섯도 다 통과하지만,
       **처음 온 사람은 뭘 눌러야 할지 모른다.** 그게 이 자가 보려는 것이다. */
    for (const el of Array.from(document.querySelectorAll(".풀이, #log, .tip"))) el.textContent = "";
  });

  /* ── ① 첫 화면에 무엇이 있나 ── */
  const 첫화면 = await page.evaluate(() => {
    const w = window as any;
    const 글 = (document.body.innerText ?? "").replace(/\s+/g, " ").trim();
    const 눌릴것 = Array.from(document.querySelectorAll("button, .tab, [data-t], .btn, .칸짜리"))
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
    return { 탭: w.S?.탭 ?? null, 진행: !!w.S?.진행, 대원수: w.S?.대원?.length ?? 0,
             파티수: w.S?.파티?.length ?? 0, 글자수: 글.length, 글앞: 글.slice(0, 160), 눌릴것 };
  });
  적기("첫 화면 탭", 첫화면.탭);
  적기("눌 수 있는 것", 첫화면.눌릴것.slice(0, 10));
  적기("첫 글", 첫화면.글앞);

  재기("첫 화면이 3초 안에 뜬다", 로딩초 <= 3, { 초: +로딩초.toFixed(1) });
  재기("첫 화면에 읽을 글이 있다", 첫화면.글자수 >= 40, { 글자수: 첫화면.글자수 });
  재기("처음부터 대원이 있다(빈 화면이 아니다)", 첫화면.대원수 >= 1, 첫화면);

  /* ── ② **아무것도 안 누르고 두면** ── */
  const 가만히 = await page.evaluate(async () => {
    const w = window as any;
    const 앞 = { 층: w.S.층, 깸: JSON.stringify(w.S.깸 ?? {}), 진행: !!w.S.진행 };
    await new Promise((r) => setTimeout(r, 6000));
    return { 앞, 뒤: { 층: w.S.층, 깸: JSON.stringify(w.S.깸 ?? {}), 진행: !!w.S.진행 } };
  });
  const 저절로 = 가만히.앞.깸 !== 가만히.뒤.깸 || 가만히.뒤.진행;
  적기("6초 가만히 뒀을 때", { 저절로돌았나: 저절로, ...가만히.뒤 });
  /* **판정하지 않는다.** 저절로 도는 게 좋은지 아닌지는 사장님이 정한 것이다
     (코드 주석: "시작하자마자 1층을 깨 버리면 고를 틈이 없다" — 일부러 꺼 뒀다).
     자는 **그래서 사람이 뭘 눌러야 하는지 화면이 말해 주는가**만 본다. */

  /* ── ③ 첫 전투까지 몇 번 눌러야 하나 ── */
  const 길 = await page.evaluate(async () => {
    const w = window as any;
    const 누름: string[] = [];
    const 눌러 = async (고르기: string, 적을말: string) => {
      const el = document.querySelector(고르기) as HTMLElement | null;
      if (!el) return false;
      el.click(); 누름.push(적을말);
      await new Promise((r) => setTimeout(r, 450));
      return true;
    };
    // 처음 온 사람이 할 법한 길: 전투 탭 → 층 고르기 → 출발
    await 눌러('[data-t="run"]', "전투 탭");
    const 층칸 = document.querySelector('#맵 [data-f="1"]') as HTMLElement | null;
    if (층칸) { 층칸.click(); 누름.push("1층"); await new Promise((r) => setTimeout(r, 450)); }
    // 출발 단추를 글자로 찾는다(id 를 짐작하지 않는다)
    const 단추 = Array.from(document.querySelectorAll("button, .btn"))
      .find((b) => /출발|시작|들어가|내려|오른/.test(b.textContent ?? "")) as HTMLElement | undefined;
    if (단추) { 단추.click(); 누름.push(`"${(단추.textContent ?? "").trim().slice(0, 10)}"`); }
    await new Promise((r) => setTimeout(r, 1200));
    return { 누름, 진행: !!w.S.진행, 층: w.S.층,
             화면글: (document.body.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 200) };
  });
  적기("눌러 본 차례", 길.누름);
  적기("그 뒤 화면", { 진행: 길.진행, 층: 길.층 });

  재기("세 번 안에 전투가 시작된다", 길.진행 && 길.누름.length <= 3, { 누름: 길.누름.length, 진행: 길.진행 });
  재기("누를 것을 화면이 가리킨다(전투·탑·출발 같은 말이 보인다)",
    /전투|탑|출발|되돌이|층/.test(첫화면.글앞 + 첫화면.눌릴것.join(" ")), { 글앞: 첫화면.글앞 });

  /* ── ④ 첫 전멸이 몇 분째인가 ── */
  const 막힘 = await page.evaluate(async () => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    w.requestAnimationFrame = () => 0;
    let 씨 = 20261012; Math.random = () => { 씨 = (씨 * 1103515245 + 12345) & 0x7fffffff; return 씨 / 0x7fffffff; };
    w.S.진행 = true; w.S.자동오름 = true;
    let 턴 = 0, 첫전멸 = 0, 최고 = 1;
    while (턴 < 200_000) {
      const 쉼앞 = w.S.쉼;
      w.한턴(); 턴++;
      최고 = Math.max(최고, w.S.층);
      if (w.S.쉼 > 쉼앞 && !첫전멸) { 첫전멸 = 턴; break; }
      if (!w.S.자동오름) break;
    }
    return { 첫전멸턴: 첫전멸, 그때층: w.S.층, 최고, 턴 };
  });
  const 분 = (t: number) => +(t * 0.15 / 60).toFixed(1);   // 턴 간격 150ms
  적기("첫 전멸", { 층: 막힘.그때층, 분: 분(막힘.첫전멸턴) });

  /* **처음 5분 안에 지면 "어렵다" 가 아니라 "고장 같다" 로 보인다.**
     반대로 십 분 내내 한 번도 안 지면 할 일이 없는 것처럼 보인다 — 둘 다 첫인상을 깎는다. */
  재기("첫 5분 안에는 지지 않는다", 막힘.첫전멸턴 === 0 || 분(막힘.첫전멸턴) >= 5,
    { 분: 분(막힘.첫전멸턴), 층: 막힘.그때층 });
} finally { await 창.browser.close(); await 창.close?.(); }
console.log(나쁨 === 0 ? "전부 통과" : `실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
