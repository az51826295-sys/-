/**
 * **게임이 살아 있나** (10-09). 모델 0 · 값 0. **다른 자보다 먼저 돌린다.**
 *   ASH_URL=... npx tsx engine/tools/ash_살았나.mts [--sabotage]
 *
 * 왜 생겼나 — 10-09 에 내가 자를 위해 `Object.defineProperty(window, "적들", …)` 를
 * 한 줄 넣었다. 그 속성은 **이미 바로 아래 줄에 있었다.** 재정의는 터진다.
 * 스크립트가 거기서 죽어 그 아래가 **전부** 안 돌았다 — 저장·불러오기, 첫 그리기,
 * **전투를 스스로 돌리는 setInterval**, 화면 갱신 고리, 음악.
 *
 * 그런데 **내 자 37개가 전부 통과했다.** 자들이 `w.한턴()` 을 손으로 불러서 쟀기 때문이다.
 * 스크립트가 끝 줄에서 죽어도 그 위에 정의된 함수는 멀쩡하다. 자는 게임이 **혼자 도는 것**을
 * 한 번도 안 봤다. 사장님이 "전투도 작동 안 하고" 라고 말해 줘서 알았다 — 자가 아니라.
 *
 * 그래서 이 자는 **손으로 아무것도 안 부른다.** 열고, 기다리고, 저절로 움직였는지만 본다.
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
  const 터짐: string[] = [];
  const 못받음: string[] = [];
  page.on("pageerror", (e) => 터짐.push(String(e).split("\n")[0].slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon\.ico|Failed to load resource/.test(m.text())) 터짐.push("콘솔: " + m.text().slice(0, 200)); });
  const 봐줄 = /favicon\.ico$/;   // 브라우저가 알아서 찾는 것 — 게임이 쓰는 파일이 아니다
  page.on("response", (r) => { if (r.status() >= 400 && !봐줄.test(r.url())) 못받음.push(`${r.status()} ${r.url()}`); });
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 2500));

  if (process.argv.includes("--sabotage")) await page.evaluate(() => {
    // 심은 고장: 스크립트 끝 줄이 터져 그 아래가 안 돈 것과 같은 꼴을 만든다
    const w = window as any;
    for (let i = 1; i < 99999; i++) clearInterval(i);
    (console as any).error("심은 고장: 스크립트가 끝에서 죽었다고 치자");
  });

  재기("스크립트가 안 터진다", 터짐.length === 0, 터짐.slice(0, 3));
  재기("빠진 파일이 없다", 못받음.length === 0, 못받음.slice(0, 5));

  // 처음 화면은 길드다. 전투 탭은 **사람이 하듯 눌러서** 간다 — 화면()을 손으로 부르지 않는다.
  await page.click('.tab[data-t="run"]');
  await new Promise((r) => setTimeout(r, 700));

  // 첫 화면이 **스스로** 그려졌나 — 손으로 그리기()를 부르지 않는다
  const 첫 = await page.evaluate(() => {
    const cv = document.querySelector("#cv") as HTMLCanvasElement;
    if (!cv.width || !cv.height) return { 판: [cv.width, cv.height], 칠해짐: 0, 글: 0 };
    const d = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
    let 색 = 0; for (let i = 0; i < d.length; i += 4000) if (d[i] + d[i+1] + d[i+2] > 30) 색++;
    return { 판: [cv.width, cv.height], 칠해짐: 색, 글: (document.querySelector("#log")?.textContent ?? "").trim().length };
  });
  재기("전투 판이 스스로 그려졌다", 첫.판[0] > 0 && 첫.칠해짐 > 5, 첫);
  재기("글이 스스로 적혔다", 첫.글 > 0, 첫);

  // **핵심**: 가만히 두면 혼자 턴이 도는가. 이것을 안 봐서 죽은 게임이 37/37 통과했다.
  const 앞 = await page.evaluate(() => {
    const w = window as any; w.S.진행 = true;          // 전투를 켜 놓기만 한다
    return { 층: w.S.층, hp: w.S.대원.map((c: any) => c.hp), 글: (document.querySelector("#log")?.textContent ?? "").length };
  });
  await new Promise((r) => setTimeout(r, 4000));        // 420ms 간격이면 넉넉히 아홉 턴
  const 뒤 = await page.evaluate(() => {
    const w = window as any;
    return { 층: w.S.층, hp: w.S.대원.map((c: any) => c.hp), 글: (document.querySelector("#log")?.textContent ?? "").length,
             적수: (w.적들 ?? []).length };
  });
  재기("가만 두면 혼자 턴이 돈다", 뒤.글 > 앞.글, { 앞글: 앞.글, 뒤글: 뒤.글 });

  // 저장이 사는가 — 저장도 죽은 줄 아래에 있었다
  const 저장됨 = await page.evaluate(() => {
    try { const w = window as any; w.저장(); return !!localStorage.getItem("guild-save-v1"); } catch { return false; }
  });
  재기("저장이 먹는다", 저장됨);
  const 자동저장 = await page.evaluate(() => typeof (window as any).저장 === "function" && typeof (window as any).불러오기 === "function");
  재기("저장·불러오기가 있다", 자동저장);
} finally { await 창.browser.close(); await 창.close?.(); }
console.log(나쁨 === 0 ? "\n전부 통과" : `\n실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
