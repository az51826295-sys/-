/**
 * **층이 스스로 오르지 않고, 자격으로 열리는가** (10-09 사장님 "다음 층으로 오를 자격을 얻는 거야").
 * 모델 0 · 값 0.
 *   ASH_URL='http://127.0.0.1:8124/ash/index.html?lang=ko' npx tsx engine/tools/ash_자격_시험.mts [--sabotage]
 *
 * 이 자가 지키는 것은 **사장님 구성 그 자체**다. 고치기 전 게임은 적을 눕히면 S.층++ 로
 * 멋대로 올라갔다 — 되돌이로 모으는 게임인데 한 판에 다음 층으로 가 버렸다.
 *
 * 재는 것: 여러 판을 돌려도 층이 그대로인가 · 깬 횟수가 쌓이는가 ·
 * 자격을 못 채우면 다음 층이 **안 열리는가** · 채우면 열리는가 · 보스 문이 더 무거운가.
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
    // 심은 고장: 판이 끝나면 층을 올려 버린다(= 고치기 전 꼴)
    const w = window as any, 원 = w.판끝;
    w.판끝 = () => { 원(); w.S.층++; };
  });

  /* 1층을 여러 판 돌린다. 게임이 스스로 도는 것은 멈추고 한 턴씩 내가 민다. */
  const 본 = await page.evaluate(() => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    try { localStorage.clear(); } catch { /* 없어도 된다 */ }
    w.S.깸 = {}; w.S.보스깸 = []; w.S.자동오름 = false; w.S.최고층 = w.열린층();
    const 처음열림 = w.S.최고층, 필요 = w.필요판(1);

    const 판돌리기 = (층: number, 판수: number) => {
      w.S.층 = 층; w.S.사냥층 = 층; w.S.진행 = true; w.S.쉼 = 0;
      w.전투준비(); w.적만들기();
      let 턴 = 0;
      while ((w.S.깸?.[층] ?? 0) < 판수 && 턴 < 60_000) { w.한턴(); 턴++; }
      return 턴;
    };

    // ① 필요한 판보다 **하나 모자라게** 돌린다 → 아직 안 열려야 한다
    판돌리기(1, 필요 - 1);
    const 모자랄때 = { 층: w.S.층, 깸: w.S.깸[1], 열림: w.열린층(), 자격: w.자격(1).참 };

    // ② 한 판 더 → 열려야 한다
    판돌리기(1, 필요);
    const 채웠을때 = { 층: w.S.층, 깸: w.S.깸[1], 열림: w.열린층(), 자격: w.자격(1).참 };

    // ③ 보스 문(10층)은 횟수만으로는 안 열린다
    w.S.깸[10] = 999;
    const 보스문 = { 횟수만: w.자격(10).참, 조건수: w.자격(10).줄.length, 조건: w.자격(10).줄.map((r: any) => r.이름) };
    w.S.보스깸.push(10);
    const 보스잡고 = w.자격(10).참;

    // ④ 자동 등반: 켜 두면 자격이 차는 순간 올라간다. **자격 전에는 안 움직여야 한다.**
    w.S.깸 = {}; w.S.보스깸 = []; w.S.최고층 = w.열린층(); w.S.자동오름 = true;
    판돌리기(1, 필요 - 1);
    const 자동_자격전 = w.S.층;
    판돌리기(1, 필요);
    const 자동_자격후 = w.S.층;
    // ⑤ 구간 문에서는 보스를 눕힐 때까지 자동이어도 머문다
    w.S.깸 = {}; w.S.보스깸 = []; for (let f = 1; f < 10; f++) w.S.깸[f] = 999;
    w.S.최고층 = w.열린층(); w.S.층 = 10; w.S.사냥층 = 10;
    const 문앞 = { 열림: w.S.최고층, 층: w.S.층 };
    w.S.깸[10] = 999; w.S.최고층 = w.열린층();
    const 문_횟수만 = { 열림: w.S.최고층 };

    return { 처음열림, 필요, 모자랄때, 채웠을때, 보스문, 보스잡고, 자동_자격전, 자동_자격후, 문앞, 문_횟수만 };
  });

  console.log(`  1층 필요 ${본.필요}판 · 처음 열린 층 ${본.처음열림}`);
  console.log(`  ${본.필요 - 1}판 → 깸 ${본.모자랄때.깸} · 열림 ${본.모자랄때.열림} · 층 ${본.모자랄때.층}`);
  console.log(`  ${본.필요}판   → 깸 ${본.채웠을때.깸} · 열림 ${본.채웠을때.열림} · 층 ${본.채웠을때.층}`);

  재기("처음엔 1층만 열려 있다", 본.처음열림 === 1, 본.처음열림);
  // **이 자의 심장** — 몇 판을 돌든 머물던 층에 그대로 있어야 한다
  재기("판을 여러 번 돌아도 층이 안 오른다", 본.모자랄때.층 === 1 && 본.채웠을때.층 === 1, { 모자랄때: 본.모자랄때.층, 채웠을때: 본.채웠을때.층 });
  재기("깬 횟수가 쌓인다", 본.모자랄때.깸 === 본.필요 - 1 && 본.채웠을때.깸 === 본.필요, 본);
  재기("자격이 모자라면 다음 층이 안 열린다", 본.모자랄때.열림 === 1 && 본.모자랄때.자격 === false, 본.모자랄때);
  재기("자격을 채우면 다음 층이 열린다", 본.채웠을때.열림 === 2 && 본.채웠을때.자격 === true, 본.채웠을때);
  재기("보스 문은 조건이 하나 더 있다", 본.보스문.조건수 === 2, 본.보스문);
  재기("보스 문은 횟수만으로 안 열린다", 본.보스문.횟수만 === false, 본.보스문);
  재기("보스를 잡으면 문이 열린다", 본.보스잡고 === true, 본.보스잡고);
  // 자동 등반은 **자격을 건너뛰지 않는다** — 이게 깨지면 사장님 구성이 무너진다
  재기("자동 등반이어도 자격 전엔 안 오른다", 본.자동_자격전 === 1, 본.자동_자격전);
  재기("자동 등반이면 자격이 차는 순간 오른다", 본.자동_자격후 === 2, 본.자동_자격후);
  재기("구간 문은 횟수만으론 안 열린다(자동이어도)", 본.문_횟수만.열림 === 10, 본);

  /* ── 전투 화면의 **관문 자격 단추** (10-10 사장님) ── */
  const 단추 = await page.evaluate(async () => {
    const w = window as any;
    const 보임 = () => { const b = document.querySelector("#자격버튼") as HTMLElement | null;
      return b ? getComputedStyle(b).display !== "none" : false; };
    w.S.탭 = "run"; w.S.진행 = true;
    w.S.층 = 11; w.맵그리기(); const 일반층 = 보임();      // 일반 층에선 볼 게 없다
    w.S.층 = 10; w.맵그리기(); const 관문층 = 보임();
    document.querySelector("#덮개")?.remove();
    (document.querySelector("#자격버튼") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 150));
    const 창 = document.querySelector("#덮개");
    const 글 = 창 ? (창.textContent ?? "") : "";
    document.querySelector("#덮개")?.remove();
    return { 일반층, 관문층, 떴나: !!창, 조건수: 창?.querySelectorAll(".조건줄").length ?? 0, 글: 글.slice(0, 60) };
  });
  재기("일반 층에선 관문 단추가 안 보인다", 단추.일반층 === false, 단추);
  재기("관문 층에선 관문 단추가 보인다", 단추.관문층 === true, 단추);
  재기("누르면 남은 조건이 뜬다", 단추.떴나 && 단추.조건수 >= 2, 단추);
} finally { await 창.browser.close(); await 창.close?.(); }
console.log(나쁨 === 0 ? "\n전부 통과" : `\n실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
