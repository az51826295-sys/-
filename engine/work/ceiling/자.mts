/**
 * **타워 디펜스가 진짜 도나** — 로키가 낸 판을 실제로 눌러 보며 잰다 (228회차 09-30). 모델 0 · 값 0.
 *   npx tsx engine/work/ceiling/자.mts
 *
 * 로키의 고리는 기준 18개 중 **맞음 3 · 틀림 1 · 모름 14** 로 닫았다. 왜 못 쟀나:
 *  ① 적·타워·총알이 **캔버스**에 그려진다. 고리는 DOM 을 읽고 화면 사진을 찍는다 — 캔버스 속은 DOM 에 없다.
 *  ② 고리가 한 조작을 보면 **'일시정지' 를 눌러 놓고** 그 뒤를 쟀다(`facts.did`).
 *     그러고서 "적이 안 움직인다"(c3 틀림) 고 적었다 — 그게 게임 탓인지 대본 탓인지 모른다.
 *
 * 그래서 여기서는 **캔버스 픽셀**과 **DOM 숫자**로 잰다. 게임 속 변수는 안 본다(ES 모듈이라 닿지도 않는다).
 * 모듈은 file:// 에서 안 불린다 — 작은 서버를 띄워 http 로 연다(그 주소 말고는 다 막는다).
 */
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { openHeadless } from "../../../src/lib/video/headless";

const 뿌리 = "engine/work/ceiling/게임";
const 종류: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const 못찾음: string[] = [];
/**
 * `--sabotage` — **자에 이빨이 있나.** 적이 한 걸음도 안 움직이게 만든다(`remain` 을 0 으로).
 * 고리는 멀쩡한 판을 보고 "적이 안 움직인다" 고 적었다. 그럼 **진짜로 안 움직이면** 내 자는 잡나?
 * 못 잡으면 위의 "맞음 16" 은 자가 눈을 감은 것이다([[ruler-must-catch-a-reproduced-bug]]).
 */
const 고장심기 = process.argv.includes("--sabotage");
const 서버 = createServer((req, res) => {
  const 길 = normalize(join(뿌리, decodeURIComponent((req.url ?? "/").split("?")[0]))).split("\\").join("/");
  const 파일 = !extname(길) ? join(뿌리, "index.html") : 길;
  if (!파일.split("\\").join("/").startsWith(뿌리) || !existsSync(파일)) { 못찾음.push(req.url ?? "?"); res.writeHead(404); res.end(); return; }
  let 몸 = readFileSync(파일, "utf8");
  if (고장심기 && 파일.endsWith("enemy.js")) {
    const 앞 = 몸;
    몸 = 몸.replace("let remain=this.speed*this.slow*dt;", "let remain=0;");
    if (몸 === 앞) { console.error("고장을 못 심었다 — 고칠 줄을 못 찾았다. 자를 믿지 마라."); process.exit(1); }
  }
  res.writeHead(200, { "content-type": 종류[extname(파일)] ?? "text/plain" });
  res.end(몸);
});
if (고장심기) console.log("**고장을 심었다** — 적이 한 걸음도 안 움직이게 했다\n");
await new Promise<void>((r) => 서버.listen(0, "127.0.0.1", () => r()));
const 포트 = (서버.address() as { port: number }).port;

const 창 = await openHeadless({ width: 1280, height: 800 });
if (!창) { console.error("헤드리스 창을 못 띄웠다"); process.exit(1); }
const page = await 창.browser.newPage();
const 콘솔오류: string[] = [];
page.on("console", (m) => { if (m.type() === "error") 콘솔오류.push(m.text().slice(0, 140)); });
page.on("pageerror", (e) => 콘솔오류.push(String(e).slice(0, 140)));
await page.setRequestInterception(true);
page.on("request", (r) => (r.url().includes(`127.0.0.1:${포트}`) ? r.continue() : r.abort()));

type 판정 = { 기준: string; 맞음: boolean | null; 본것: string };
const 결과: 판정[] = [];
const 재 = (기준: string, 맞음: boolean | null, 본것: string) => 결과.push({ 기준, 맞음, 본것 });
const 쉼 = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 캔버스 그림을 짧은 지문으로 — 같으면 화면이 안 바뀐 것이다. */
const 지문 = () => page.evaluate(() => {
  const c = document.getElementById("gameCanvas") as HTMLCanvasElement;
  const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  let h = 0;
  for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) >>> 0;
  return h;
});
const 숫자 = () => page.evaluate(() => ({
  돈: Number(document.getElementById("money")?.textContent ?? -1),
  목숨: Number(document.getElementById("lives")?.textContent ?? -1),
  웨이브: Number(document.getElementById("wave")?.textContent ?? -1),
  화면: Array.from(document.querySelectorAll(".screen")).find((s) => s.classList.contains("active"))?.id ?? "?",
  말: (document.getElementById("message")?.textContent ?? "").trim(),
  최고: Number(document.getElementById("highScore")?.textContent ?? -1),
}));
/** 캔버스 좌표(900x560)를 화면 좌표로 바꿔 누른다. */
const 캔버스누르기 = async (x: number, y: number) => {
  const r = await page.evaluate(() => { const c = document.getElementById("gameCanvas")!.getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height }; });
  await page.mouse.click(r.l + (x * r.w) / 900, r.t + (y * r.h) / 560);
  await 쉼(120);
};

await page.goto(`http://127.0.0.1:${포트}/`, { waitUntil: "networkidle0" });
await 쉼(400);

// ── c1 제목 화면 ──────────────────────────────────────────
{
  const s = await 숫자();
  const 시작있나 = await page.evaluate(() => (document.getElementById("startButton")?.textContent ?? "").includes("시작"));
  재("c1 제목 화면에 '시작' 과 최고 기록", 시작있나 && s.화면 === "titleScreen" && s.최고 >= 0, `화면 ${s.화면} · 최고 ${s.최고}`);
}

// ── c2 시작 누르면 게임 화면 ───────────────────────────────
await page.click("#startButton");
await 쉼(300);
const 처음 = await 숫자();
재("c2 게임 화면으로 바뀌고 돈·목숨·웨이브가 보인다", 처음.화면 === "gameScreen" && 처음.돈 > 0 && 처음.목숨 > 0 && 처음.웨이브 >= 1,
  `화면 ${처음.화면} · 돈 ${처음.돈} · 목숨 ${처음.목숨} · 웨이브 ${처음.웨이브}`);

// ── c3 적이 나타나 움직인다 (캔버스가 계속 바뀐다) ──────────
{
  const 지문들: number[] = [];
  for (let i = 0; i < 12; i++) { 지문들.push(await 지문()); await 쉼(400); }
  const 다른것 = new Set(지문들).size;
  재("c3 5초 동안 화면(캔버스)이 계속 바뀐다 = 무언가 움직인다", 다른것 >= 6, `4.8초에 서로 다른 그림 ${다른것}/12`);
}

// ── c12 일시정지 ─────────────────────────────────────────
{
  await page.click("#pauseButton");
  await 쉼(300);
  const a = await 지문(); await 쉼(900); const b = await 지문();
  const 멈췄나 = a === b;
  await page.click("#pauseButton");
  await 쉼(300);
  const c = await 지문(); await 쉼(700); const d = await 지문();
  재("c12 일시정지하면 멈추고, 풀면 다시 움직인다", 멈췄나 && c !== d, `멈춤 ${멈췄나 ? "예" : "아니오"} · 푼 뒤 움직임 ${c !== d ? "예" : "아니오"}`);
}

// ── c7 길 위에는 안 놓인다 ────────────────────────────────
{
  const 앞 = await 숫자();
  await 캔버스누르기(90, 135);   // 길의 첫 구간
  const 뒤 = await 숫자();
  재("c7 길 위를 누르면 안 놓이고 돈이 그대로", 뒤.돈 === 앞.돈 && 뒤.말.includes("길 위"), `돈 ${앞.돈}→${뒤.돈} · 말 "${뒤.말}"`);
}

// ── c5 잔디에 놓으면 돈이 값만큼 준다 ──────────────────────
{
  const 앞 = await 숫자();
  await 캔버스누르기(300, 60);   // 길에서 먼 잔디
  const 뒤 = await 숫자();
  재("c5 잔디에 놓으면 돈이 정확히 50(블래스터) 준다", 앞.돈 - 뒤.돈 === 50, `돈 ${앞.돈}→${뒤.돈} (${앞.돈 - 뒤.돈} 줄음)`);
}

// ── c13·c14·c15 타워를 누르면 패널·업그레이드·판매 ──────────
{
  await 캔버스누르기(300, 60);   // 방금 놓은 타워를 누른다
  const 패널 = await page.evaluate(() => {
    const p = document.getElementById("towerPanel");
    return { 보임: !!p && !p.classList.contains("hidden"), 글: (document.getElementById("towerStats")?.textContent ?? "").trim() };
  });
  재("c13 타워를 누르면 업그레이드·판매 패널이 뜬다", 패널.보임, `패널 ${패널.보임 ? "보임" : "안 보임"} · "${패널.글.slice(0, 50)}"`);
  if (패널.보임) {
    const 앞 = await 숫자(), 앞글 = 패널.글;
    await page.click("#upgradeButton"); await 쉼(250);
    const 뒤 = await 숫자();
    const 뒤글 = await page.evaluate(() => (document.getElementById("towerStats")?.textContent ?? "").trim());
    재("c14 업그레이드하면 돈이 줄고 공격력·사거리가 오른다", 뒤.돈 < 앞.돈 && 뒤글 !== 앞글, `돈 ${앞.돈}→${뒤.돈} · "${앞글.slice(0, 32)}" → "${뒤글.slice(0, 32)}"`);
    const 팔기앞 = await 숫자();
    await page.click("#sellButton"); await 쉼(250);
    const 팔기뒤 = await 숫자();
    const 패널닫힘 = await page.evaluate(() => !!document.getElementById("towerPanel")?.classList.contains("hidden"));
    재("c15 팔면 돈이 늘고 패널이 닫힌다", 팔기뒤.돈 > 팔기앞.돈 && 패널닫힘, `돈 ${팔기앞.돈}→${팔기뒤.돈} · 패널 ${패널닫힘 ? "닫힘" : "열림"}`);
  } else { 재("c14 업그레이드", null, "패널이 안 떠서 못 잼"); 재("c15 판매", null, "패널이 안 떠서 못 잼"); }
}

// ── c6 돈보다 비싼 타워 ───────────────────────────────────
{
  // 돈을 거의 다 쓴다(블래스터 50 짜리를 여러 개)
  const 자리: [number, number][] = [[300, 60], [360, 60], [420, 60], [480, 60], [540, 60], [600, 60], [660, 60], [300, 500], [360, 500], [560, 60]];
  for (const [x, y] of 자리) { const s = await 숫자(); if (s.돈 < 85) break; await 캔버스누르기(x, y); }
  await page.evaluate(() => (document.querySelector('.tower-choice[data-type="cannon"]') as HTMLElement)?.click());
  await 쉼(150);
  const 앞 = await 숫자();
  if (앞.돈 >= 85) 재("c6 돈 모자랄 때 안 놓인다", null, `돈이 아직 ${앞.돈} 이라 못 잼`);
  else {
    await 캔버스누르기(780, 60);
    const 뒤 = await 숫자();
    재("c6 돈보다 비싼 타워는 안 놓이고 돈도 그대로", 뒤.돈 === 앞.돈 && 뒤.말.includes("모자"), `돈 ${앞.돈}→${뒤.돈} · 말 "${뒤.말}"`);
  }
}

// ── c8·c9 — **길 바로 옆에** 타워를 놓고 적이 죽나 본다 ─────
// 첫 판에서 (300,60)·(360,60) 에 놓고 "돈이 안 는다" 고 적었는데, 그 자리는 길에서 멀었다.
// 자가 서툴러서 못 죽인 것을 게임 탓으로 적으면 안 된다 — 다시 시작하고 길 옆에 붙여 놓는다.
{
  await page.reload({ waitUntil: "networkidle0" }); await 쉼(300);
  await page.click("#startButton"); await 쉼(300);
  // 길: (0,135)→(185,135)→(185,410)→(430,410)→(430,155)→(690,155)→(690,455)→(900,455)
  // 첫 구간(y=135) 바로 위아래, 길에서 45px 떨어진 자리 넷
  for (const [x, y] of [[80, 85], [150, 190], [300, 360], [480, 205]] as [number, number][]) {
    const s = await 숫자(); if (s.돈 < 50) break;
    await 캔버스누르기(x, y);
  }
  const 놓은뒤 = await 숫자();
  let 돈최저 = 놓은뒤.돈, 돈늘어난적 = false, 앞 = 놓은뒤;
  const 끝 = Date.now() + 60_000;
  while (Date.now() < 끝) {
    await 쉼(600);
    const 지금 = await 숫자();
    if (지금.화면 !== "gameScreen") break;
    if (지금.돈 > 앞.돈) 돈늘어난적 = true;
    돈최저 = Math.min(돈최저, 지금.돈);
    앞 = 지금;
  }
  재("c8·c9 길 옆에 타워를 놓으면 적이 죽고 돈이 는다", 돈늘어난적, `타워 놓은 뒤 돈 ${놓은뒤.돈} → 60초 동안 최저 ${돈최저} · 마지막 ${앞.돈} · 돈이 오른 적 ${돈늘어난적 ? "있음" : "**없음**"}`);
}

// ── c4·c10·c11 — 타워 없이 끝까지 둬 본다(게임 오버까지) ────
{
  await page.reload({ waitUntil: "networkidle0" }); await 쉼(300);
  await page.click("#startButton"); await 쉼(300);
  const 시작 = await 숫자();
  let 목숨준적 = false, 최고웨이브 = 시작.웨이브, 게임오버 = false, 앞 = 시작;
  const 끝시각 = Date.now() + 240_000;
  while (Date.now() < 끝시각) {
    await 쉼(600);
    const 지금 = await 숫자();
    if (지금.화면 === "gameOverScreen") { 게임오버 = true; break; }
    if (지금.목숨 < 앞.목숨) 목숨준적 = true;
    if (지금.웨이브 > 최고웨이브) 최고웨이브 = 지금.웨이브;
    앞 = 지금;
  }
  재("c4 적이 끝에 닿으면 목숨이 준다", 목숨준적, `목숨 ${시작.목숨} → ${앞.목숨}`);
  재("c10 웨이브 번호가 오른다", 최고웨이브 > 시작.웨이브, `웨이브 ${시작.웨이브} → ${최고웨이브}`);
  if (게임오버) {
    const 끝 = await page.evaluate(() => ({ 웨: (document.getElementById("finalWave")?.textContent ?? "").trim(), 다시: !!document.getElementById("retryButton") }));
    재("c11 목숨 0 이면 게임 오버 화면에 간 웨이브가 보인다", !!끝.웨 && 끝.다시, `도달 웨이브 "${끝.웨}" · 다시 하기 ${끝.다시 ? "있음" : "없음"}`);
  } else 재("c11 게임 오버 화면", null, `240초 안에 목숨이 0이 안 됐다(마지막 목숨 ${앞.목숨}·웨이브 ${최고웨이브}) — 못 잼`);

  // ── c16 새로고침해도 최고 기록 ──────────────────────────
  // **게임 오버까지 가야 저장이 일어난다.** 첫 판에는 목숨 2 에서 시간이 끝나 저장 자체가 없었다 —
  // 그걸 "저장이 안 된다" 고 적으면 자가 거짓말을 하는 것이다.
  const 저장값 = await page.evaluate(() => { try { return JSON.stringify(Object.entries(localStorage)); } catch { return "(못 읽음)"; } });
  if (!게임오버) 재("c16 새로고침해도 최고 기록이 남는다", null, `게임 오버까지 못 가서 저장이 일어나지 않았다 — 못 잼 (저장소 ${저장값.slice(0, 60)})`);
  else {
    await page.reload({ waitUntil: "networkidle0" }); await 쉼(400);
    const 다시 = await 숫자();
    재("c16 새로고침해도 제목 화면에 최고 기록이 남는다", 다시.최고 > 0, `새로고침 뒤 최고 ${다시.최고} · 저장소 ${저장값.slice(0, 80)}`);
  }
}

{
  // favicon 은 게임이 요청한 것이 아니라 브라우저가 늘 찾는 것이다 — 그걸 게임 탓으로 세면 안 된다.
  const 진짜못찾음 = 못찾음.filter((u) => !u.includes("favicon"));
  // 브라우저가 늘 찾는 favicon 의 404 는 콘솔에도 한 줄 남는데, 그 줄에는 "favicon" 이 안 적힌다
  // ("Failed to load resource: ...404"). 서버가 센 404 가 favicon 뿐이면 그 줄도 게임 탓이 아니다.
  const favicon만 = 못찾음.length > 0 && 진짜못찾음.length === 0;
  const 진짜오류 = 콘솔오류.filter((e) => !e.includes("favicon") && !(favicon만 && /404|Failed to load resource/i.test(e)));
  재("c18 바깥에서 받아오는 것 없이 돈다", 진짜오류.length === 0 && 진짜못찾음.length === 0,
    `콘솔 오류 ${진짜오류.length}${진짜오류.length ? ": " + 진짜오류.join(" / ") : ""} · 못 찾은 파일 ${진짜못찾음.length}${진짜못찾음.length ? ": " + 진짜못찾음.join(" ") : ""} (favicon 제외: ${못찾음.length - 진짜못찾음.length}건)`);
}

await 창.close();
서버.close();

const 맞 = 결과.filter((r) => r.맞음 === true).length, 틀 = 결과.filter((r) => r.맞음 === false).length, 몰 = 결과.filter((r) => r.맞음 === null).length;
console.log("");
for (const r of 결과) console.log(`${r.맞음 === true ? "맞음  " : r.맞음 === false ? "어긋남" : "못 잼 "} ${r.기준}\n        ${r.본것}`);
console.log(`\n**맞음 ${맞} · 어긋남 ${틀} · 못 잼 ${몰}** (${결과.length}개 중)`);
