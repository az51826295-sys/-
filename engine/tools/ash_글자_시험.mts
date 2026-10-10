/**
 * **화면에 깨진 글자가 없는가** (10-10). 모델 0 · 값 0. **모든 탭의 글을 눈으로 훑는 자.**
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_글자_시험.mts [--sabotage]
 *
 * 왜 생겼나 — 10-10 에 T2·T3 재료를 더했더니 대장간에 **undefined 가 다섯 개** 찍혔다.
 * 대장간만 따로 `{파편,잔혼,수호핵}` 이름표를 들고 있었기 때문이다.
 * **자 열 개가 전부 통과하는 동안 아무도 이것을 못 봤다** — 화면의 *글자*를 읽는 자가 없었다.
 * 기능은 다 되는데 글자가 깨진 것은, 자가 기능만 보면 영원히 안 보인다.
 *
 * 그래서 이 자는 기능을 안 본다. **탭마다 글을 긁어서** 깨진 자국만 찾는다:
 * undefined · NaN · [object Object] · null · 빈 숫자 · 안 바뀐 템플릿 자국.
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
    // 심은 고장: 재료 이름표에서 하나를 뺀다(= 고치기 전 꼴)
    const w = window as any; delete w.재료이름.가죽;
  });

  const 본 = await page.evaluate(() => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    // **모든 것이 보이는 상태**로 만든다 — 잠겨 있으면 깨진 글도 안 보인다
    w.S.최고층 = 35; w.S.금화 = 999999;
    Object.assign(w.S.가방, { 파편: 99, 잔혼: 99, 수호핵: 9, 가죽: 99, 강철: 99, 이빨: 9, 거인뼈: 9, 별가루: 999 });
    w.S.깸 = {}; for (let f = 1; f <= 35; f++) w.S.깸[f] = 99;
    w.S.보스깸 = [10, 20, 30];
    for (const c of w.S.대원) c.레벨 = 30;
    for (const k of Object.keys(w.레시피)) w.만들기(k);

    const 글: Record<string, string> = {};
    const 긁 = (이름: string, 어디: string) => { 글[이름] = (document.querySelector(어디)?.textContent ?? "").replace(/\s+/g, " "); };

    for (const t of ["crew", "forge", "shop"]) { w.S.탭 = t; w.S.보는대원 = null; w.화면(); 긁(t, "#panel"); }
    w.S.탭 = "hall"; w.화면(); 긁("hall", "#hall");

    // 캐릭터 상세 — 장비 탭과 기술 탭 둘 다
    w.S.탭 = "crew";
    for (const c of w.S.대원) {
      w.S.보는대원 = c.id;
      for (const 탭 of ["장비", "기술"]) { w.S.대원탭 = 탭; w.화면(); 긁(`${c.키}-${탭}`, "#panel"); }
    }
    // 가방 창
    w.S.보는대원 = w.S.대원[0].id; w.S.대원탭 = "장비"; w.S.가방슬롯 = null; w.화면();
    (document.querySelector('[data-슬롯="무기"]') as HTMLElement)?.click();
    긁("가방", "#panel .가방패널"); w.S.가방슬롯 = null;
    // 출발 창 · 맵
    w.S.진행 = false; w.S.탭 = "run"; w.화면(); w.맵그리기();
    긁("맵", "#맵");
    w.출발창(20); 긁("출발창", "#덮개"); document.querySelector("#덮개")?.remove();
    // 길드 쪽창 넷
    for (const id of ["출석단추", "식당단추", "mailBtn", "공지단추", "설정단추"]) {
      document.querySelector("#덮개")?.remove();
      (document.querySelector("#" + id) as HTMLElement)?.click();
      긁(`길드-${id}`, "#덮개");
    }
    document.querySelector("#덮개")?.remove();
    // 전투 글
    w.S.층 = 20; w.S.사냥층 = 20; w.S.진행 = true; w.전투준비(); w.적만들기();
    for (let t = 0; t < 600; t++) w.한턴();
    긁("전투로그", "#log");
    return 글;
  });

  const 나쁜글 = /undefined|NaN|\[object Object\]|\bnull\b|\$\{/;
  const 걸린: Array<[string, string]> = [];
  for (const [어디, 글] of Object.entries(본)) {
    const m = 글.match(나쁜글);
    if (m) 걸린.push([어디, 글.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + 40)]);
  }
  console.log(`  훑은 화면 ${Object.keys(본).length}곳`);
  재기("어느 화면에도 깨진 글자가 없다", 걸린.length === 0, 걸린);

  // 빈 화면도 고장이다 — 글이 아예 없으면 안 그려진 것이다
  const 빈곳 = Object.entries(본).filter(([, 글]) => 글.trim().length < 5).map(([어디]) => 어디);
  재기("빈 화면이 없다", 빈곳.length === 0, 빈곳);
} finally { await 창.browser.close(); await 창.close?.(); }
console.log(나쁨 === 0 ? "전부 통과" : `실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
