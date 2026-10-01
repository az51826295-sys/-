/**
 * **6판의 '틀림 둘' 이 진짜인가** (228회차 09-30). 모델 0 · 값 0.
 *   npx tsx engine/work/ceiling/자6.mts
 *
 * 심판은 `c08-tower-damage`·`c09-enemy-kill-reward` 를 **틀림**이라 적었다.
 * 5판에서는 같은 둘이 **틀린 판정**이었다(대본이 멈춤에 갇혀서). 그러니 이번에도 재 본다.
 * 길: (-25,260)→(150,260)→(150,105)→(420,105)→(420,400)→(700,400)→(700,180)→(930,180)
 * 타워는 **둘뿐**이다(기본 50 · 중화 500) — 주문은 셋을 시켰다.
 */
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { openHeadless } from "../../../src/lib/video/headless";

const 뿌리 = "engine/work/ceiling/게임6";
const 서버 = createServer((req, res) => {
  const 길 = normalize(join(뿌리, decodeURIComponent((req.url ?? "/").split("?")[0]))).split("\\").join("/");
  const 파일 = !extname(길) ? join(뿌리, "index.html") : 길;
  if (!파일.split("\\").join("/").startsWith(뿌리) || !existsSync(파일)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": extname(파일) === ".html" ? "text/html" : "text/plain" });
  res.end(readFileSync(파일));
});
await new Promise<void>((r) => 서버.listen(0, "127.0.0.1", () => r()));
const 포트 = (서버.address() as { port: number }).port;
const 창 = await openHeadless({ width: 1360, height: 900 });
if (!창) process.exit(1);
const page = await 창.browser.newPage();
await page.setRequestInterception(true);
page.on("request", (r) => (r.url().includes(`127.0.0.1:${포트}`) ? r.continue() : r.abort()));
await page.goto(`http://127.0.0.1:${포트}/`, { waitUntil: "networkidle0" });
const 쉼 = (ms: number) => new Promise((r) => setTimeout(r, ms));

const 상태 = () => page.evaluate(() => {
  const 읽 = ["money", "lives"].map((id) => Number((document.getElementById(id)?.textContent ?? "").replace(/[^0-9-]/g, "") || "-1"));
  const c = document.getElementById("gameCanvas") as HTMLCanvasElement | null;
  return { 돈: 읽[0], 목숨: 읽[1], 캔버스: c ? `${c.width}x${c.height}` : "없음", 상태글: (document.getElementById("status")?.textContent ?? "").trim().slice(0, 60) };
});
const 캔버스누르기 = async (x: number, y: number, W: number, H: number) => {
  const r = await page.evaluate(() => { const c = document.getElementById("gameCanvas")!.getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height }; });
  await page.mouse.click(r.l + (x * r.w) / W, r.t + (y * r.h) / H);
  await 쉼(180);
};

await page.click("#startBtn"); await 쉼(600);
const 처음 = await 상태();
console.log("시작 직후:", JSON.stringify(처음));
const [W, H] = 처음.캔버스.split("x").map(Number);

await page.evaluate(() => (document.querySelector('[data-kind="basic"]') as HTMLElement)?.click());
await 쉼(200);
// 길 바로 옆 네 자리(길에서 40~55px 떨어짐)
for (const [x, y] of [[80, 205], [205, 150], [360, 160], [470, 345]] as [number, number][]) {
  const s = await 상태(); if (s.돈 < 50) break;
  await 캔버스누르기(x, y, W, H);
}
const 놓은뒤 = await 상태();
console.log("타워 놓은 뒤:", JSON.stringify(놓은뒤));

let 돈오름 = false, 앞 = 놓은뒤, 최고돈 = 놓은뒤.돈;
for (let i = 0; i < 60; i++) {
  await 쉼(800);
  const 지금 = await 상태();
  if (지금.돈 > 앞.돈) 돈오름 = true;
  최고돈 = Math.max(최고돈, 지금.돈);
  앞 = 지금;
  if (지금.목숨 <= 0) break;
}
console.log("");
console.log(`${돈오름 ? "맞음  " : "어긋남"} c08·c09 타워가 적을 죽여 돈이 는다 — 돈 ${놓은뒤.돈} → 최고 ${최고돈} · 마지막 ${앞.돈} · 목숨 ${놓은뒤.목숨} → ${앞.목숨}`);
console.log(`       (심판은 둘 다 **틀림**이라 적었다)`);
console.log(`       상태글: "${앞.상태글}"`);
await 창.close(); 서버.close();
