/**
 * **캐릭터 카드 창이 실제로 되는가** (10-09). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8123/ash/index.html npx tsx engine/tools/ash_카드_시험.mts
 * 목록이 간단해졌는지 · 눌러서 창이 뜨는지 · 대표·출전·장비가 먹는지 · 닫히는지.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mts";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(본)); };
const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) { console.error("창 없음"); process.exit(1); }
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 2000));
  // 장비는 **가방에 있어야** 입힐 칸이 생긴다 — 빈 가방으로 재면 "장비 칸 없음" 이 고장처럼 보인다
  await page.evaluate(() => { const w = window as any;
    w.S.대원.length || w.S.대원.push(w.대원만들기("기사", 5));
    // 만들기는 최고층 3 이상 + 금화까지 본다 — 재료만 심으면 조용히 거절한다(10-09 자가 여기서 한 번 틀렸다)
    Object.assign(w.S.가방, { 파편: 99, 잔혼: 99, 수호핵: 9, 별가루: 999 });
    w.S.최고층 = Math.max(w.S.최고층, 5); w.S.금화 = Math.max(w.S.금화, 9999);
    if (!w.만들기("가죽갑옷")) throw new Error("장비를 못 만들었다 — 시험 밑바탕이 틀렸다");
    w.S.탭 = "crew"; });
  await page.evaluate(() => (document.querySelector('.tab[data-t="crew"]') as HTMLElement).click());
  await new Promise((r) => setTimeout(r, 600));

  const 줄 = await page.evaluate(() => {
    const r = document.querySelector("#panel .row.카드열기");
    return r ? { 글: (r.textContent ?? "").trim(), 능력치: /체력 |공격 |방어 /.test(r.textContent ?? "") } : null;
  });
  재기("목록 줄이 눌리는 카드다", !!줄, 줄);
  재기("목록에 능력치가 없다", !!줄 && !줄.능력치, 줄?.글);

  await page.evaluate(() => (document.querySelector("#panel .row.카드열기") as HTMLElement).click());
  await new Promise((r) => setTimeout(r, 500));
  const 창있나 = await page.evaluate(() => {
    const d = document.querySelector("#덮개");
    return d ? { 능력치: /체력/.test(d.textContent ?? ""), 장비: !!d.querySelector("[data-eq],[data-off]"), 대표: !!d.querySelector("#대표"), 출전: !!d.querySelector("#출전") } : null;
  });
  재기("누르면 카드 창이 뜬다", !!창있나, 창있나);
  재기("카드에 능력치가 있다", !!창있나?.능력치, 창있나);
  재기("카드에 입힐 장비 칸이 있다", !!창있나?.장비, 창있나);

  const 입힘 = await page.evaluate(() => {
    const w = window as any;
    const b = document.querySelector("#덮개 [data-eq]") as HTMLElement | null;
    if (!b) return null;
    b.click();
    return { 낀것: w.S.가방.장비.filter((x: { 누구: number | null }) => x.누구 !== null).length };
  });
  재기("장비가 실제로 입혀진다", !!입힘 && 입힘.낀것 > 0, 입힘);
  await new Promise((r) => setTimeout(r, 400));
  재기("카드에 대표가 있다", !!창있나?.대표, 창있나);
  // 10-09 사장님 "캐릭터 누르면 출전 빼기 없애" — 출전은 층을 고를 때 한 자리에서만 정한다
  재기("카드에 출전 단추가 없다", 창있나?.출전 === false, 창있나);

  // 10-09: 처음 판정식이 `(A && B) || A` 여서 사실상 A만 봤다 — 대표 지정을 빼도 통과했다.
  // **비워 두고 눌러서, 그 캐릭터 id 가 들어왔는지**로 본다.
  const 대표됨 = await page.evaluate(() => {
    const w = window as any; w.S.대표 = null;
    const 누구 = w.S.대원[0].id;
    (document.querySelector("#덮개 #대표") as HTMLElement).click();
    return { 누구, 뒤: w.S.대표 };
  });
  재기("대표로가 먹는다", 대표됨.뒤 === 대표됨.누구, 대표됨);

  /* ── 기술·특성을 누르면 무슨 일을 하는지 나온다 (10-09 사장님) ────────── */
  await new Promise((r) => setTimeout(r, 300));
  const 풀이 = await page.evaluate(() => {
    const 봄= (고를: string) => {
      const b = document.querySelector(`#덮개 [data-풀이^="${고를}"]`) as HTMLElement | null;
      if (!b) return { 태그: false, 글: "", 숫자: false };
      b.click();
      const p = document.querySelector("#덮개 #풀이") as HTMLElement;
      const 글 = p.classList.contains("on") ? (p.textContent ?? "") : "";
      return { 태그: true, 글, 숫자: /\d/.test(글) };
    };
    const 기 = 봄("기술"), 특 = 봄("특성");
    // 같은 것을 또 누르면 닫힌다
    const b = document.querySelector('#덮개 [data-풀이^="특성"]') as HTMLElement;
    b.click();
    const 닫힘 = !(document.querySelector("#덮개 #풀이") as HTMLElement).classList.contains("on");
    return { 기, 특, 닫힘 };
  });
  재기("기술을 누르면 설명이 뜬다", 풀이.기.태그 && 풀이.기.글.length > 10, 풀이.기);
  재기("기술 설명에 숫자가 있다", 풀이.기.숫자, 풀이.기.글.slice(0, 80));
  재기("특성을 누르면 뭘 강화하는지 뜬다", 풀이.특.태그 && 풀이.특.글.length > 10, 풀이.특);
  재기("특성 설명에 숫자가 있다", 풀이.특.숫자, 풀이.특.글.slice(0, 80));
  재기("또 누르면 닫힌다", 풀이.닫힘, 풀이);

  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => (document.querySelector("#덮개 #닫기") as HTMLElement).click());
  await new Promise((r) => setTimeout(r, 300));
  재기("닫기가 먹는다", await page.evaluate(() => !document.querySelector("#덮개")));

  재기("내리기·태우기 단추가 없다", await page.evaluate(() => !/내리기|태우기/.test(document.querySelector("#panel")?.textContent ?? "")));
  // 10-09 사장님 "캐릭터 창에 별빛회복약 안 보이게"
  재기("캐릭터 탭에 별빛 회복약이 없다", await page.evaluate(() => !/회복약/.test(document.querySelector("#panel")?.textContent ?? "")));
} finally { await 창.browser.close(); await 창.close?.(); }
console.log(나쁨 === 0 ? "\n전부 통과" : `\n실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
