/**
 * **5판이 진짜로 고장났나** (228회차 09-30). 모델 0 · 값 0.
 *   npx tsx engine/work/ceiling/자5.mts
 *
 * 숫자 읽는 심판이 5판을 **맞음 9 · 틀림 2 · 모름 8** 로 닫으며 둘을 고장이라 적었다:
 *   `tower_attack`(타워가 안 쏜다) · `pause_resume`(일시정지를 풀어도 안 돈다)
 *
 * **심판이 틀린 적이 있다**(09-30 1판에서 멀쩡한 코드를 세 바퀴 고치게 했다). 그러니 이 둘도 재 본다.
 * 이 판은 적이 DOM 조각(`#board .enemy` 류)으로 그려지고 tick 은 `setInterval(tick,40)` 이다.
 * 길: (0,100)→(180,100)→(180,380)→(420,380)→(420,170)→(700,170)→(700,430)→(900,430) · 화살 65(사거리 145)
 */
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { openHeadless } from "../../../src/lib/video/headless";

const 뿌리 = "engine/work/ceiling/게임5";
const 서버 = createServer((req, res) => {
  const 길 = normalize(join(뿌리, decodeURIComponent((req.url ?? "/").split("?")[0]))).split("\\").join("/");
  const 파일 = !extname(길) ? join(뿌리, "index.html") : 길;
  if (!파일.split("\\").join("/").startsWith(뿌리) || !existsSync(파일)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": extname(파일) === ".html" ? "text/html" : "text/plain" });
  res.end(readFileSync(파일));
});
await new Promise<void>((r) => 서버.listen(0, "127.0.0.1", () => r()));
const 포트 = (서버.address() as { port: number }).port;
const 창 = await openHeadless({ width: 1280, height: 860 });
if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }
const page = await 창.browser.newPage();
await page.setRequestInterception(true);
page.on("request", (r) => (r.url().includes(`127.0.0.1:${포트}`) ? r.continue() : r.abort()));
await page.goto(`http://127.0.0.1:${포트}/`, { waitUntil: "networkidle0" });
const 쉼 = (ms: number) => new Promise((r) => setTimeout(r, ms));

const 상태 = () => page.evaluate(() => {
  const 읽 = ["money", "lives", "wave"].map((id) => Number((document.getElementById(id)?.textContent ?? "").replace(/[^0-9-]/g, "") || "-1"));
  const b = document.getElementById("board")!;
  return {
    돈: 읽[0], 목숨: 읽[1], 웨이브: 읽[2],
    조각수: b.children.length,
    자리: Array.from(b.children).slice(0, 6).map((e) => `${(e as HTMLElement).style.left}|${(e as HTMLElement).style.top}`).join(","),
    단추: (document.getElementById("pauseButton")?.textContent ?? "").trim(),
    토스트: (document.getElementById("toast")?.textContent ?? "").trim(),
  };
});
const 보드누르기 = async (x: number, y: number) => {
  const r = await page.evaluate(() => { const b = document.getElementById("board")!.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; });
  await page.mouse.click(r.l + (x * r.w) / 900, r.t + (y * r.h) / 520);
  await 쉼(150);
};

await page.click("#startButton"); await 쉼(600);
console.log("시작 직후   ", JSON.stringify(await 상태()));

// ── 타워가 쏘나: 길 바로 옆(사거리 145 안)에 화살탑 셋 ──────────
for (const [x, y] of [[90, 40], [120, 240], [300, 320]] as [number, number][]) {
  const s = await 상태(); if (s.돈 < 65) break;
  await 보드누르기(x, y);
}
const 놓은뒤 = await 상태();
console.log("타워 놓은 뒤", JSON.stringify(놓은뒤));
let 돈오름 = false, 목숨줆 = false, 앞 = 놓은뒤;
for (let i = 0; i < 50; i++) {
  await 쉼(800);
  const 지금 = await 상태();
  if (지금.돈 > 앞.돈) 돈오름 = true;
  if (지금.목숨 < 앞.목숨) 목숨줆 = true;
  앞 = 지금;
  if (지금.목숨 <= 0) break;
}
console.log(`\n${돈오름 ? "맞음  " : "어긋남"} 타워가 적을 죽여 돈이 는다 — 돈 ${놓은뒤.돈} → ${앞.돈} · 목숨 ${놓은뒤.목숨} → ${앞.목숨}`);
console.log(`       (심판은 'tower_attack' 을 **틀림**이라 적었다)`);

// ── 일시정지 풀면 다시 도나 ───────────────────────────────────
await page.reload({ waitUntil: "networkidle0" }); await 쉼(300);
await page.click("#startButton"); await 쉼(1500);
const 전 = await 상태();
await page.click("#pauseButton"); await 쉼(1200);
const 멈춤 = await 상태();
await page.click("#pauseButton"); await 쉼(1500);
const 푼뒤 = await 상태();
await 쉼(1500);
const 푼뒤2 = await 상태();
const 멈췄나 = 멈춤.자리 === (await (async () => { await 쉼(400); return (await 상태()).자리; })()) || true;
console.log(`\n멈추기 전 자리: ${전.자리.slice(0, 48)}`);
console.log(`멈춘 동안 자리: ${멈춤.자리.slice(0, 48)} · 단추 "${멈춤.단추}"`);
console.log(`푼 뒤   자리: ${푼뒤.자리.slice(0, 48)}`);
console.log(`1.5초 뒤 자리: ${푼뒤2.자리.slice(0, 48)}`);
const 다시도나 = 푼뒤.자리 !== 푼뒤2.자리 || 푼뒤2.돈 !== 푼뒤.돈 || 푼뒤2.목숨 !== 푼뒤.목숨;
console.log(`${다시도나 ? "맞음  " : "어긋남"} 일시정지를 풀면 다시 돈다`);
console.log(`       (심판은 'pause_resume' 을 **틀림**이라 적었다)`);
void 멈췄나;
await 창.close(); 서버.close();
