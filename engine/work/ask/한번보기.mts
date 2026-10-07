/** 전투가 왜 안 도나 — 창 안에서 상태를 직접 들여다본다. 모델 0 · 값 0. */
import { readFileSync, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { openHeadless } from "../../../src/lib/video/headless";

const 뿌리 = (process.argv[2] ?? "engine/work/ask/모방게임-gpt-5.6-luna").split("\\").join("/");
const 서버 = createServer((q, s) => {
  const 길 = normalize(join(뿌리, decodeURIComponent((q.url ?? "/").split("?")[0]))).split("\\").join("/");
  const f = (existsSync(길) && statSync(길).isDirectory()) || !extname(길) ? join(뿌리, "index.html") : 길;
  if (!existsSync(f)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { "content-type": extname(f) === ".html" ? "text/html" : "text/plain" }); s.end(readFileSync(f));
});
await new Promise<void>((r) => 서버.listen(0, "127.0.0.1", () => r()));
const 포트 = (서버.address() as { port: number }).port;
const 창 = await openHeadless({ width: 1280, height: 800 });
if (!창) process.exit(1);
const page = await 창.browser.newPage();
page.on("pageerror", (e) => console.log(`창오류: ${String(e).slice(0, 160)}`));
page.on("console", (m) => { if (m.type() === "error") console.log(`콘솔: ${m.text().slice(0, 140)}`); });
await page.goto(`http://127.0.0.1:${포트}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
const 쉼 = (ms: number) => new Promise((r) => setTimeout(r, ms));
await 쉼(1200);
// 던전 탭으로 가서 **수정 체력을 3초마다** 찍는다. 짐작 말고 숫자를 본다.
await page.evaluate(() => {
  const t = [...document.querySelectorAll<HTMLElement>("*")].find((e) =>
    (e.textContent ?? "").trim().includes("던전") && (e.textContent ?? "").trim().length <= 6
    && e.offsetParent !== null && e.getBoundingClientRect().top > innerHeight * 0.8);
  (t?.closest("button,[role=button],a") as HTMLElement ?? t)?.click();
});
await 쉼(600);
for (let t = 0; t <= 45; t += 3) {
  const g = await page.evaluate(() => (document.body.innerText ?? "").replace(/\s+/g, " "));
  const 층 = (g.match(/층\s*(\d+)/) ?? [])[1] ?? "?";
  const 수 = (g.match(/내 수정 (\d+) · 적 수정 (\d+)/) ?? []).slice(1).join("/") || "?";
  const 사람 = (g.match(/🧙/g) ?? []).length, 적 = (g.match(/👹/g) ?? []).length;
  console.log(`${String(t).padStart(2)}초  층 ${층} · 수정 ${수} · 내편 ${사람} 적 ${적}`);
  await 쉼(3000);
}
await 창.browser.close(); await 창.close?.(); 서버.close();
