/**
 * **고친 뒤 판(게임2)이 진짜 도나** — 남은 `모름 12` 가 진짜인지 잰다 (228회차 09-30). 모델 0 · 값 0.
 *   npx tsx engine/work/ceiling/자2.mts [--sabotage]
 *
 * 고친 고리는 같은 주문에 **맞음 9 · 틀림 0 · 모름 12**(21개 중)로 닫았다. 전(맞음 3·틀림 1·모름 14)보다 낫지만
 * 아직 절반 넘게 못 봤다. 그 12개가 **진짜 안 되는 것인지, 그냥 못 본 것인지**는 따로 재야 안다.
 *
 * 이 판은 파일 하나(12,471자)에 캔버스 900x560. 길·값은 소스에서 읽었다:
 *   길 (-20,105)→(190,105)→(190,400)→(470,400)→(470,165)→(720,165)→(720,455)→(920,455)
 *   궁수 80(사거리 105) · 대포 150 · 연사포 120 · 시작 돈 420
 */
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { openHeadless } from "../../../src/lib/video/headless";

const 뿌리 = "engine/work/ceiling/게임2";
const 고장심기 = process.argv.includes("--sabotage");
const 종류: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const 못찾음: string[] = [];
const 서버 = createServer((req, res) => {
  const 길 = normalize(join(뿌리, decodeURIComponent((req.url ?? "/").split("?")[0]))).split("\\").join("/");
  const 파일 = !extname(길) ? join(뿌리, "index.html") : 길;
  if (!파일.split("\\").join("/").startsWith(뿌리) || !existsSync(파일)) { 못찾음.push(req.url ?? "?"); res.writeHead(404); res.end(); return; }
  let 몸 = readFileSync(파일, "utf8");
  if (고장심기 && 파일.endsWith(".html")) {
    // 이빨 확인: 적을 죽여도 **돈을 안 주게** 한다. c9 를 잡아야 자다.
    const 앞 = 몸;
    몸 = 몸.replace(/money\s*\+=\s*e\.reward/g, "money+=0").replace(/money\s*\+=\s*[a-z]+\.reward/g, "money+=0");
    if (몸 === 앞) { console.error("고장을 못 심었다 — 고칠 자리를 못 찾았다. 자를 믿지 마라."); process.exit(1); }
  }
  /**
   * `--원인확인` — c08·c09 가 어긋난 **까닭이 이 한 줄인가**.
   * 겨냥할 적을 고르는 곳이 `best=Infinity` 로 시작해 놓고 `pathScore>best` 를 찾는다.
   * 어떤 값도 Infinity 보다 크지 않으니 `target` 은 늘 null 이고 **타워는 한 번도 안 쏜다.**
   * 이 줄만 `-Infinity` 로 바꿔서 돈이 오르면, 어긋남의 까닭이 그 줄이라는 뜻이다(고친 판을 내는 게 아니라 **원인을 대는 것**).
   */
  if (process.argv.includes("--원인확인") && 파일.endsWith(".html")) {
    const 앞 = 몸;
    몸 = 몸.replace("let target=null,best=Infinity;", "let target=null,best=-Infinity;").replace("e.progress>best-999", "true");
    if (몸 === 앞) { console.error("바꿀 줄을 못 찾았다"); process.exit(1); }
    console.log("**겨냥 줄만 고쳐서 돌린다** — best=Infinity → -Infinity\n");
  }
  res.writeHead(200, { "content-type": 종류[extname(파일)] ?? "text/plain" });
  res.end(몸);
});
await new Promise<void>((r) => 서버.listen(0, "127.0.0.1", () => r()));
const 포트 = (서버.address() as { port: number }).port;
if (고장심기) console.log("**고장을 심었다** — 적을 죽여도 돈을 안 준다\n");

const 창 = await openHeadless({ width: 1280, height: 860 });
if (!창) { console.error("헤드리스 창을 못 띄웠다"); process.exit(1); }
const page = await 창.browser.newPage();
const 콘솔오류: string[] = [];
page.on("console", (m) => { if (m.type() === "error") 콘솔오류.push(m.text().slice(0, 140)); });
page.on("pageerror", (e) => 콘솔오류.push(String(e).slice(0, 140)));
await page.setRequestInterception(true);
page.on("request", (r) => (r.url().includes(`127.0.0.1:${포트}`) ? r.continue() : r.abort()));

const 결과: { 기준: string; 맞음: boolean | null; 본것: string }[] = [];
const 재 = (기준: string, 맞음: boolean | null, 본것: string) => 결과.push({ 기준, 맞음, 본것 });
const 쉼 = (ms: number) => new Promise((r) => setTimeout(r, ms));
const 지문 = () => page.evaluate(() => {
  const c = document.getElementById("gameCanvas") as HTMLCanvasElement;
  const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) >>> 0; return h;
});
// **창 안에서 이름 붙인 함수를 만들면 안 된다** — esbuild 가 `__name(...)` 을 끼워 넣는데 창 안엔 그게 없다.
// 오늘 엔진에서 똑같이 당하고도 자에서 또 했다. 전부 제자리에 편다.
const 숫자 = () => page.evaluate(() => {
  const 읽 = ["moneyText", "lifeText", "waveText", "highScoreTitle"].map((id) => {
    const t = (document.getElementById(id)?.textContent ?? "").replace(/[^0-9-]/g, "");
    return t === "" ? -1 : Number(t);
  });
  return {
    돈: 읽[0], 목숨: 읽[1], 웨이브: 읽[2],
    화면: (Array.from(document.querySelectorAll(".screen")).find((s) => s.classList.contains("active")) as HTMLElement | undefined)?.id ?? "?",
    말: (document.getElementById("message")?.textContent ?? "").trim(),
    최고: 읽[3],
    패널: (document.getElementById("towerPanel") as HTMLElement | null)?.style.display === "block",
    패널글: (document.getElementById("panelStats")?.textContent ?? "").trim(),
  };
});
const 누르기 = async (x: number, y: number) => {
  const r = await page.evaluate(() => { const c = document.getElementById("gameCanvas")!.getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height }; });
  await page.mouse.click(r.l + (x * r.w) / 900, r.t + (y * r.h) / 560);
  await 쉼(150);
};
/** 사이드바에서 타워 종류를 고른다(글자로). */
const 타워고르기 = (이름: string) => page.evaluate((n) => {
  const b = Array.from(document.querySelectorAll("#towerBar *")).find((e) => (e.textContent ?? "").includes(n) && (e as HTMLElement).offsetParent !== null);
  if (b) (b as HTMLElement).click();
  return !!b;
}, 이름);

await page.goto(`http://127.0.0.1:${포트}/`, { waitUntil: "networkidle0" });
await 쉼(400);

재("c01 제목 화면에 '시작' 과 최고 기록", (await 숫자()).화면 === "titleScreen", `화면 ${(await 숫자()).화면} · 최고 ${(await 숫자()).최고}`);
await page.click("#startBtn"); await 쉼(400);
const 처음 = await 숫자();
재("c02·c03 게임 화면 + 돈·목숨·웨이브가 숫자로 보인다", 처음.화면 === "gameScreen" && 처음.돈 > 0 && 처음.목숨 > 0,
  `화면 ${처음.화면} · 돈 ${처음.돈} · 목숨 ${처음.목숨} · 웨이브 ${처음.웨이브}`);

{ // c04 적이 나타나 움직인다
  const 지문들: number[] = [];
  for (let i = 0; i < 10; i++) { 지문들.push(await 지문()); await 쉼(400); }
  재("c04 화면이 계속 바뀐다(적이 움직인다)", new Set(지문들).size >= 5, `4초에 서로 다른 그림 ${new Set(지문들).size}/10`);
}
{ // c13 일시정지
  await page.click("#pauseBtn"); await 쉼(300);
  const a = await 지문(); await 쉼(900); const b = await 지문();
  await page.click("#pauseBtn"); await 쉼(300);
  const c = await 지문(); await 쉼(700); const d = await 지문();
  재("c13 일시정지하면 멈추고 풀면 다시 움직인다", a === b && c !== d, `멈춤 ${a === b ? "예" : "아니오"} · 푼 뒤 ${c !== d ? "움직임" : "안 움직임"}`);
}
{ // c07 길 위
  const 앞 = await 숫자(); await 누르기(100, 105); const 뒤 = await 숫자();
  재("c07 길 위에는 안 놓인다", 뒤.돈 === 앞.돈, `돈 ${앞.돈}→${뒤.돈} · 말 "${뒤.말}"`);
}
{ // c05 설치 — 궁수 80
  await 타워고르기("궁수");
  const 앞 = await 숫자(); await 누르기(120, 180); const 뒤 = await 숫자();
  재("c05 잔디에 놓으면 돈이 궁수 값 80 만큼 준다", 앞.돈 - 뒤.돈 === 80, `돈 ${앞.돈}→${뒤.돈} (${앞.돈 - 뒤.돈} 줄음)`);
}
{ // c14·c15 업그레이드·판매
  await 누르기(120, 180);
  const p = await 숫자();
  재("c14a 타워를 누르면 강화·판매 패널이 뜬다", p.패널, `패널 ${p.패널 ? "보임" : "안 보임"} · "${p.패널글}"`);
  if (p.패널) {
    const 앞 = await 숫자();
    await page.click("#upgradeBtn"); await 쉼(300);
    const 뒤 = await 숫자();
    재("c14 강화하면 돈이 줄고 공격·사거리가 오른다", 뒤.돈 < 앞.돈 && 뒤.패널글 !== 앞.패널글, `돈 ${앞.돈}→${뒤.돈} · "${앞.패널글}" → "${뒤.패널글}"`);
    const s앞 = await 숫자();
    await page.click("#sellBtn"); await 쉼(300);
    const s뒤 = await 숫자();
    재("c15 팔면 돈이 는다", s뒤.돈 > s앞.돈, `돈 ${s앞.돈}→${s뒤.돈}`);
  } else { 재("c14 강화", null, "패널이 안 떠서 못 잼"); 재("c15 판매", null, "패널이 안 떠서 못 잼"); }
}
{ // c08·c09 길 옆에 붙여 놓고 적이 죽나
  await 타워고르기("궁수");
  for (const [x, y] of [[120, 60], [140, 170], [250, 350], [400, 350]] as [number, number][]) {
    const s = await 숫자(); if (s.돈 < 80) break; await 누르기(x, y);
  }
  const 놓은뒤 = await 숫자();
  let 돈늘어난적 = false, 앞 = 놓은뒤;
  const 끝 = Date.now() + 60_000;
  while (Date.now() < 끝) {
    await 쉼(600); const 지금 = await 숫자();
    if (지금.화면 !== "gameScreen") break;
    if (지금.돈 > 앞.돈) 돈늘어난적 = true;
    앞 = 지금;
  }
  재("c08·c09 길 옆 타워가 적을 죽이고 돈이 는다", 돈늘어난적, `타워 놓은 뒤 돈 ${놓은뒤.돈} → 마지막 ${앞.돈} · 돈이 오른 적 ${돈늘어난적 ? "있음" : "**없음**"}`);
}
{ // c10·c11·c12·c16 타워 없이 끝까지
  await page.reload({ waitUntil: "networkidle0" }); await 쉼(300);
  await page.click("#startBtn"); await 쉼(300);
  const 시작 = await 숫자();
  let 목숨준적 = false, 최고웨이브 = 시작.웨이브, 게임오버 = false, 앞 = 시작;
  const 끝시각 = Date.now() + 240_000;
  while (Date.now() < 끝시각) {
    await 쉼(600); const 지금 = await 숫자();
    if (지금.화면 === "overScreen") { 게임오버 = true; break; }
    if (지금.목숨 < 앞.목숨) 목숨준적 = true;
    if (지금.웨이브 > 최고웨이브) 최고웨이브 = 지금.웨이브;
    앞 = 지금;
  }
  재("c10 적이 끝에 닿으면 목숨이 준다", 목숨준적, `목숨 ${시작.목숨} → ${앞.목숨}`);
  재("c11 웨이브 번호가 오른다", 최고웨이브 > 시작.웨이브, `웨이브 ${시작.웨이브} → ${최고웨이브}`);
  if (게임오버) {
    const 끝 = await page.evaluate(() => ({ 웨: (document.getElementById("overWave")?.textContent ?? "").trim(), 다시: !!document.getElementById("againBtn") }));
    재("c12 목숨 0 이면 게임 오버 화면에 간 웨이브가 보인다", !!끝.웨 && 끝.다시, `도달 "${끝.웨}" · 다시 하기 ${끝.다시 ? "있음" : "없음"}`);
    const 저장 = await page.evaluate(() => { try { return JSON.stringify(Object.entries(localStorage)); } catch { return "(못 읽음)"; } });
    await page.reload({ waitUntil: "networkidle0" }); await 쉼(400);
    재("c16 새로고침해도 최고 기록이 남는다", (await 숫자()).최고 > 0, `새로고침 뒤 최고 ${(await 숫자()).최고} · 저장소 ${저장.slice(0, 70)}`);
  } else {
    재("c12 게임 오버 화면", null, `240초 안에 목숨이 0이 안 됐다(목숨 ${앞.목숨}·웨이브 ${최고웨이브}) — 못 잼`);
    재("c16 최고 기록 저장", null, "게임 오버까지 못 가서 저장이 안 일어났다 — 못 잼");
  }
}
{
  const 진짜못찾음 = 못찾음.filter((u) => !u.includes("favicon"));
  const favicon만 = 못찾음.length > 0 && 진짜못찾음.length === 0;
  const 진짜오류 = 콘솔오류.filter((e) => !e.includes("favicon") && !(favicon만 && /404|Failed to load resource/i.test(e)));
  재("c20 바깥에서 받아오는 것 없이 돈다", 진짜오류.length === 0 && 진짜못찾음.length === 0,
    `콘솔 오류 ${진짜오류.length}${진짜오류.length ? ": " + 진짜오류.join(" / ") : ""} · 못 찾은 파일 ${진짜못찾음.length}`);
}

await 창.close(); 서버.close();
const 맞 = 결과.filter((r) => r.맞음 === true).length, 틀 = 결과.filter((r) => r.맞음 === false).length, 몰 = 결과.filter((r) => r.맞음 === null).length;
console.log("");
for (const r of 결과) console.log(`${r.맞음 === true ? "맞음  " : r.맞음 === false ? "어긋남" : "못 잼 "} ${r.기준}\n        ${r.본것}`);
console.log(`\n**맞음 ${맞} · 어긋남 ${틀} · 못 잼 ${몰}** (${결과.length}개 중)`);
