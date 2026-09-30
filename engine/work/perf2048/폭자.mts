import { readFileSync } from "node:fs";
import { openHeadless } from "../../../src/lib/video/headless";
const 창 = await openHeadless({ width: 1200, height: 900 });
if (!창) process.exit(1);
const page = await 창.browser.newPage();
await page.setRequestInterception(true);
page.on("request", (r) => (r.url().startsWith("data:") || r.url() === "about:blank" ? r.continue() : r.abort()));
const html = readFileSync("engine/work/perf2048/index.html", "utf8");
console.log("창폭  판크기      칸 폭   글꼴(값별로 다른 것)");
for (const w of [360, 400, 420, 500, 700, 900, 1200]) {
  await page.setViewport({ width: w, height: 900 });
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 250));
  // 값이 다른 타일이 섞이게 몇 수 둔다
  for (const k of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) { await page.keyboard.press(k as never); await new Promise((r) => setTimeout(r, 40)); }
  const m = await page.evaluate(() => {
    const 칸 = Array.from(document.querySelectorAll("#board > *")) as HTMLElement[];
    const b = document.getElementById("board")!.getBoundingClientRect();
    const 찬것 = 칸.filter((c) => (c.textContent ?? "").trim());
    return { 판: `${Math.round(b.width)}x${Math.round(b.height)}`, 폭: [...new Set(칸.map((c) => Math.round(c.getBoundingClientRect().width)))].join("/"),
      글꼴: [...new Set(찬것.map((c) => getComputedStyle(c).fontSize))].join("/") };
  });
  console.log(String(w).padEnd(5), m.판.padEnd(11), m.폭.padEnd(7), m.글꼴);
}
await 창.close();
