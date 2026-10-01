/**
 * **게임 화면을 찍는다** (228회차 10-01). 모델 0 · 값 0.
 *   npx tsx engine/work/ceiling/사진.mts [게임7]
 *
 * 사장님 "캐릭터는 어캐 했어? 사진 찍어봐". 시작하고, 타워 몇 개 놓고, 적이 나올 때까지 기다렸다가 찍는다.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { openHeadless } from "../../../src/lib/video/headless";

const 어느것 = process.argv[2] ?? "게임7";
const 뿌리 = `engine/work/ceiling/${어느것}`;
const 종류: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const 서버 = createServer((req, res) => {
  const 길 = normalize(join(뿌리, decodeURIComponent((req.url ?? "/").split("?")[0]))).split("\\").join("/");
  const 파일 = !extname(길) ? join(뿌리, "index.html") : 길;
  if (!파일.split("\\").join("/").startsWith(뿌리) || !existsSync(파일)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": 종류[extname(파일)] ?? "text/plain" });
  res.end(readFileSync(파일));
});
await new Promise<void>((r) => 서버.listen(0, "127.0.0.1", () => r()));
const 포트 = (서버.address() as { port: number }).port;

const 창 = await openHeadless({ width: 1400, height: 950 });
if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }
const page = await 창.browser.newPage();
await page.setRequestInterception(true);
page.on("request", (r) => (r.url().includes(`127.0.0.1:${포트}`) ? r.continue() : r.abort()));
await page.goto(`http://127.0.0.1:${포트}/`, { waitUntil: "networkidle0" });
const 쉼 = (ms: number) => new Promise((r) => setTimeout(r, ms));
const 칸 = "C:/Users/az518/Desktop/로키-소리게임2-사진";
mkdirSync(칸, { recursive: true });
const 찍기 = async (이름: string) => {
  const b = await page.screenshot({ type: "png" });
  writeFileSync(`${칸}/${이름}.png`, b);
  console.log(`  → ${칸}/${이름}.png`);
};

await 찍기("1-제목화면");
await page.evaluate(() => (document.getElementById("startButton") as HTMLElement)?.click());
await 쉼(800);
await 찍기("2-게임시작");

// 길 옆에 타워 몇 개
const 누르기 = async (x: number, y: number) => {
  const r = await page.evaluate(() => { const c = document.getElementById("gameCanvas")!.getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height }; });
  await page.mouse.click(r.l + (x * r.w) / 960, r.t + (y * r.h) / 600);
  await 쉼(200);
};
const 고르기 = async (id: string) => { await page.evaluate((i) => (document.getElementById(i) as HTMLElement)?.click(), id); await 쉼(150); };
const 놓을곳: [string, number, number][] = [["arrowTowerButton", 120, 60], ["cannonTowerButton", 230, 200], ["frostTowerButton", 460, 170]];
for (const [단추, x, y] of 놓을곳) { await 고르기(단추); await 누르기(x, y); }
await 쉼(6000);
await 찍기("3-적과타워");
await 쉼(14000);
await 찍기("4-한참뒤");

// 캔버스를 크게 잘라서 — 적·타워가 어떻게 생겼는지 보이게
const c = await page.$("#gameCanvas");
if (c) { writeFileSync(`${칸}/5-화면만.png`, await c.screenshot({ type: "png" })); console.log(`  → ${칸}/5-화면만.png`); }

await 창.close(); 서버.close();
console.log("\n찍었다.");
