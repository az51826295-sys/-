/**
 * **고리가 "적이 안 움직인다" 고 적은 까닭** (228회차 09-30). 모델 0 · 값 0.
 *   npx tsx engine/work/ceiling/왜못봤나.mts
 *
 * 고리는 세 바퀴 내내 c3(적이 길을 따라 움직인다)을 **틀림**으로 적었다. 그런데 내가 따로 재니
 * 적은 잘 움직였다(캔버스가 4.8초에 12/12 다르게 바뀌고, 목숨이 20→1 로 줄고, 웨이브가 1→4).
 *
 * 고리가 실제로 한 조작(`loop.facts.did`)에 '일시정지' 누르기가 **네 번** 있다.
 * 멈춤 상태에서 단추 글자는 "▶ 다시" 로 바뀌는데, 화면 한가운데 "일시정지" 라고 적힌 **안내 딱지**가 따로 있다.
 * 그러니 글자 "일시정지" 로 누르면 **켤 때는 단추를 누르고, 끌 때는 딱지를 누른다** — 영영 안 꺼진다.
 * 이 자는 그 짐작을 실제로 눌러서 확인한다.
 */
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { openHeadless } from "../../../src/lib/video/headless";

const 뿌리 = "engine/work/ceiling/게임";
const 종류: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const 서버 = createServer((q, s) => {
  const 길 = normalize(join(뿌리, decodeURIComponent((q.url ?? "/").split("?")[0]))).split("\\").join("/");
  const f = !extname(길) ? join(뿌리, "index.html") : 길;
  if (!f.split("\\").join("/").startsWith(뿌리) || !existsSync(f)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { "content-type": 종류[extname(f)] ?? "text/plain" });
  s.end(readFileSync(f));
});
await new Promise<void>((r) => 서버.listen(0, "127.0.0.1", () => r()));
const 포트 = (서버.address() as { port: number }).port;

const 창 = await openHeadless({ width: 1280, height: 800 });
if (!창) { console.error("헤드리스 창을 못 띄웠다"); process.exit(1); }
const page = await 창.browser.newPage();
await page.setRequestInterception(true);
page.on("request", (r) => (r.url().includes(`127.0.0.1:${포트}`) ? r.continue() : r.abort()));
await page.goto(`http://127.0.0.1:${포트}/`, { waitUntil: "networkidle0" });

const 쉼 = (ms: number) => new Promise((r) => setTimeout(r, ms));
const 상태 = () => page.evaluate(() => ({
  단추: (document.getElementById("pauseButton")?.textContent ?? "").trim(),
  멈춤: !document.getElementById("pausedLabel")?.classList.contains("hidden"),
}));
/** 고리의 `click_text` 를 흉내 — 그 글자를 품은, 보이는 것 중 첫째를 누른다. */
const 글자로누르기 = (글: string) => page.evaluate((t) => {
  const 것들 = Array.from(document.querySelectorAll("button, a, [role=button], div, span, p"));
  const 맞는것 = 것들.find((e) => (e.textContent ?? "").trim().includes(t) && (e as HTMLElement).offsetParent !== null);
  if (!맞는것) return "(못 찾음)";
  (맞는것 as HTMLElement).click();
  return `<${맞는것.tagName.toLowerCase()} id="${맞는것.id || "(없음)"}"> "${(맞는것.textContent ?? "").trim().slice(0, 16)}"`;
}, 글);

await page.click("#startButton");
await 쉼(400);
console.log("시작 직후            ", JSON.stringify(await 상태()));
console.log("'일시정지' 글자로 누름 →", await 글자로누르기("일시정지"));
await 쉼(300);
console.log("  그 뒤              ", JSON.stringify(await 상태()));
console.log("'일시정지' 글자로 또  →", await 글자로누르기("일시정지"));
await 쉼(300);
const 끝 = await 상태();
console.log("  그 뒤              ", JSON.stringify(끝));
console.log(끝.멈춤
  ? "\n**멈춘 채로 남는다** — 글자 '일시정지' 로는 못 푼다(풀려면 '▶ 다시' 를 눌러야 한다).\n고리는 이 상태로 화면을 보고 \"적이 안 움직인다\" 고 적었다."
  : "\n풀렸다 — 이 짐작은 틀렸다. 다른 까닭을 찾아야 한다.");
await 창.close();
서버.close();
