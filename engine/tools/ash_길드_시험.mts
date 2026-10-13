/**
 * **길드 단추가 살아 있는가** (10-10 사장님 "눌러도 반응이 없다"). 모델 0 · 값 0.
 *   ASH_URL='http://127.0.0.1:8124/ash/index.html?lang=ko' npx tsx engine/tools/ash_길드_시험.mts [--sabotage]
 *
 * 우편함·공지·설정은 HTML 에만 있고 **JS 연결이 한 줄도 없었다** — 눌러도 아무 일이 없는데
 * 화면에는 멀쩡한 단추로 보였다. 그래서 이 자는 **실제로 눌러서** 창이 뜨는지 본다.
 * 출석은 하루 한 번만 먹어야 하고, 식당 버프는 **공격력 숫자에 실제로 닿아야** 한다.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html?lang=ko";
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
    // 심은 고장: 단추에서 손을 뗀다(= 고치기 전 꼴 — 보이지만 아무 일도 안 난다)
    for (const id of ["출석단추", "식당단추", "mailBtn", "공지단추", "설정단추"]) {
      const b = document.querySelector("#" + id) as HTMLElement | null;
      if (b) (b as any).onclick = null;
    }
  });

  const 본 = await page.evaluate(() => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    try { localStorage.clear(); } catch { /* 없어도 된다 */ }
    w.S.탭 = "hall"; w.화면();
    const 누르기 = (id: string) => {
      document.querySelector("#덮개")?.remove();
      (document.querySelector("#" + id) as HTMLElement | null)?.click();
      const d = document.querySelector("#덮개");
      const 글 = d ? (d.textContent ?? "") : "";
      return { 떴나: !!d, 글 };
    };

    /* ① 다섯 단추가 전부 창을 띄우는가 */
    const 창들: Record<string, boolean> = {};
    for (const id of ["mailBtn", "공지단추", "설정단추", "식당단추"]) 창들[id] = 누르기(id).떴나;

    /* ② 출석 — 별가루와 금화가 실제로 는다 */
    w.S.출석날 = null; w.S.가방.별가루 = 0; w.S.금화 = 0;
    const 첫 = 누르기("출석단추");
    const 받음 = { 별가루: w.S.가방.별가루, 금화: w.S.금화, 떴나: 첫.떴나 };
    /* ③ 같은 날 또 눌러도 안 준다 */
    const 둘째 = 누르기("출석단추");
    const 또 = { 별가루: w.S.가방.별가루, 금화: w.S.금화, 글: 둘째.글.slice(0, 40) };
    /* ④ 날이 바뀌면 다시 준다 */
    w.S.출석날 = "2000-01-01";
    누르기("출석단추");
    const 새날 = { 별가루: w.S.가방.별가루 };

    /* ⑤ 식당 — 버프가 **공격력 숫자에 실제로 닿는가** */
    document.querySelector("#덮개")?.remove();
    const c = w.S.대원[0];
    w.S.버프 = null;
    const 공격앞 = w.공격력(c);
    w.S.가방.잔혼 = 99; w.S.금화 = 99999;
    (document.querySelector("#식당단추") as HTMLElement).click();
    (document.querySelector("#덮개 #차리기") as HTMLElement | null)?.click();
    const 공격뒤 = w.공격력(c);
    const 버프 = w.S.버프 ? { ...w.S.버프 } : null;
    const 잔혼뒤 = w.S.가방.잔혼;

    /* ⑥ 판이 끝나면 버프가 닳는다 */
    w.S.층 = 1; w.S.사냥층 = 1; w.S.진행 = true; w.S.쉼 = 0; w.전투준비(); w.적만들기();
    let t = 0; const 앞깸 = w.S.깸?.[1] ?? 0;
    while (t < 60_000 && (w.S.깸?.[1] ?? 0) === 앞깸) { w.한턴(); t++; }
    const 한판뒤 = w.S.버프?.남은 ?? 0;

    return { 창들, 받음, 또, 새날, 공격앞, 공격뒤, 버프, 잔혼뒤, 한판뒤 };
  });

  console.log(`  식당 — 공격 ${본.공격앞} → ${본.공격뒤} · 버프 ${JSON.stringify(본.버프)}`);
  재기("우편함이 열린다", 본.창들.mailBtn, 본.창들);
  재기("공지가 열린다", 본.창들.공지단추, 본.창들);
  재기("설정이 열린다", 본.창들.설정단추, 본.창들);
  재기("식당이 열린다", 본.창들.식당단추, 본.창들);
  재기("출석하면 별가루 50 · 금화 2,000", 본.받음.별가루 === 50 && 본.받음.금화 === 2000, 본.받음);
  재기("같은 날 또 눌러도 안 준다", 본.또.별가루 === 50 && 본.또.금화 === 2000, 본.또);
  재기("날이 바뀌면 다시 준다", 본.새날.별가루 === 100, 본.새날);
  재기("식당이 재료를 쓴다", 본.잔혼뒤 === 89, 본.잔혼뒤);
  // **버프가 숫자에 닿는가** — 여기가 안 되면 식당은 글만 띄우는 단추다
  재기("식당 버프가 공격력을 올린다", 본.공격뒤 > 본.공격앞, { 앞: 본.공격앞, 뒤: 본.공격뒤 });
  재기("버프가 10판짜리다", 본.버프?.남은 === 10, 본.버프);
  재기("판이 끝나면 버프가 한 판 닳는다", 본.한판뒤 === 9, 본.한판뒤);
} finally { await 창.browser.close(); await 창.close?.(); }
console.log(나쁨 === 0 ? "전부 통과" : `실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
