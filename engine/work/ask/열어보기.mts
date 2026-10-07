/**
 * 폴더 하나를 **그냥 열어서** 글과 사진을 낸다 (228회차 10-03). 모델 0 · 값 0.
 *   npx tsx engine/work/ask/열어보기.mts <폴더> [찍을이름]
 *
 * 10-03 에 로키가 만든 게임을 **내 게임용 자**로 재다가 전부 '못 찾음' 이 나왔다.
 * 모르는 판은 재기 전에 **먼저 본다.** 안 맞는 자로 재면 멀쩡한 것이 떨어진다.
 */
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { openHeadless } from "../../../src/lib/video/headless";

const 뿌리 = (process.argv[2] ?? "").split("\\").join("/");
const 이름 = process.argv[3] ?? "열어보기";
if (!뿌리 || !existsSync(뿌리)) { console.error("폴더가 없다"); process.exit(1); }
const 사진칸 = "C:/Users/az518/Desktop/로키-열어본-사진";
mkdirSync(사진칸, { recursive: true });

const 종류: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const 서버 = createServer((q, s) => {
  const 길 = normalize(join(뿌리, decodeURIComponent((q.url ?? "/").split("?")[0]))).split("\\").join("/");
  const f = (existsSync(길) && statSync(길).isDirectory()) || !extname(길) ? join(뿌리, "index.html") : 길;
  if (!f.split("\\").join("/").startsWith(뿌리) || !existsSync(f)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { "content-type": 종류[extname(f)] ?? "text/plain" }); s.end(readFileSync(f));
});
await new Promise<void>((r) => 서버.listen(0, "127.0.0.1", () => r()));
const 포트 = (서버.address() as { port: number }).port;

// 세로 폰으로도 본다 — 사장님 게임은 **모바일 세로**가 조건이다. `--폰`
const 폰 = process.argv.includes("--폰");
const 창 = await openHeadless(폰 ? { width: 390, height: 844 } : { width: 1280, height: 900 });
if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }
const page = await 창.browser.newPage();
const 오류: string[] = [];
page.on("pageerror", (e) => 오류.push(String(e).slice(0, 140)));
page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.location()?.url ?? "")) 오류.push(m.text().slice(0, 120)); });
page.on("dialog", (d) => d.accept().catch(() => {}));
await page.setRequestInterception(true);
page.on("request", (r) => (r.url().includes(`127.0.0.1:${포트}`) ? r.continue() : r.abort()));
await page.goto(`http://127.0.0.1:${포트}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
await new Promise((r) => setTimeout(r, 2000));

// 열자마자 어떤 단추를 눌러 두고 싶을 때: `--누르기 전투`
const i누 = process.argv.indexOf("--누르기");
if (i누 > 0 && process.argv[i누+1]) {
  await page.evaluate((라벨) => {
    const t = [...document.querySelectorAll<HTMLElement>("button,[role=button],a,div,span")]
      .filter((e) => (e.textContent ?? "").trim() === 라벨 && e.offsetParent !== null)[0];
    t?.click();
  }, process.argv[i누+1]);
  await new Promise((r) => setTimeout(r, Number(process.argv[i누+2]) || 4000));
}

const 글 = await page.evaluate(() => (document.body.innerText ?? "").replace(/\n{2,}/g, "\n").trim());
const 단추 = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("button,[role=button]")]
  .filter((e) => e.offsetParent !== null).map((e) => (e.textContent ?? "").trim().slice(0, 24)).slice(0, 40));
await page.screenshot({ path: `${사진칸}/${이름}.png`, fullPage: true });

console.log(`글 ${글.length}자\n${글.slice(0, 1600)}`);
console.log(`\n누를 수 있는 것 ${단추.length}개: ${단추.join(" · ")}`);
console.log(`\n창 오류 ${오류.length}건${오류.length ? ": " + 오류.slice(0, 3).join(" | ") : ""}`);
console.log(`사진 → ${사진칸}/${이름}.png`);
await 창.browser.close(); await 창.close?.(); 서버.close();
