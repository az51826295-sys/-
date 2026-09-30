/** 박스 크기가 변하나 — 화면만 잰다(모델 0). 사장님 "박스 크기가 계속 달라지고" */
import { readFileSync } from "node:fs";
import { openHeadless } from "../../../src/lib/video/headless";
const 창 = await openHeadless({ width: 800, height: 900 });
if (!창) process.exit(1);
const page = await 창.browser.newPage();
await page.setRequestInterception(true);
page.on("request", (r) => (r.url().startsWith("data:") || r.url() === "about:blank" ? r.continue() : r.abort()));
await page.setContent(readFileSync("engine/work/perf2048/index.html", "utf8"), { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 400));
const 재기 = async () => page.evaluate(() => {
  const 칸 = Array.from(document.querySelectorAll("#board > *"));
  const b = document.getElementById("board")!.getBoundingClientRect();
  return {
    판: { w: Math.round(b.width), h: Math.round(b.height) },
    칸들: 칸.map((c) => { const r = (c as HTMLElement).getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), 글: (c.textContent ?? "").trim(), 크기: getComputedStyle(c as HTMLElement).fontSize }; }),
  };
});
const 방향 = ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"];
const 기록: { 수: number; 판: string; 칸폭: string; 글꼴: string; 최대: string }[] = [];
for (let n = 0; n <= 120; n++) {
  if (n) { await page.keyboard.press(방향[n % 4] as never); await new Promise((r) => setTimeout(r, 40)); }
  if (n % 20 === 0 || n === 120) {
    const m = await 재기();
    const 폭 = [...new Set(m.칸들.map((c) => c.w))].sort((a, b) => a - b);
    const 글꼴 = [...new Set(m.칸들.map((c) => c.크기))];
    const 최대 = Math.max(...m.칸들.map((c) => Number(c.글) || 0));
    기록.push({ 수: n, 판: `${m.판.w}x${m.판.h}`, 칸폭: 폭.join("/"), 글꼴: 글꼴.join("/"), 최대: String(최대) });
  }
}
await 창.close();
console.log("수   판크기      칸 폭(서로 다른 값)   글꼴 크기            가장 큰 수");
for (const r of 기록) console.log(String(r.수).padEnd(4), r.판.padEnd(11), r.칸폭.padEnd(21), r.글꼴.padEnd(20), r.최대);
const 판들 = [...new Set(기록.map((r) => r.판))], 폭들 = [...new Set(기록.map((r) => r.칸폭))];
console.log(`\n판 크기 ${판들.length === 1 ? "안 변함 " + 판들[0] : "**변함** " + 판들.join(" → ")}`);
console.log(`칸 폭   ${폭들.length === 1 ? "안 변함 " + 폭들[0] : "**변함** " + 폭들.join(" → ")}`);
