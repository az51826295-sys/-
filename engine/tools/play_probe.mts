/**
 * **끝까지 해 보는 기계에 이빨이 있나** (205회차 09-23).
 * 잠근 두 줄: **원본은 깨져야 하고, 판 8 은 안 깨져야 한다.**
 * 원본을 못 깨면 자가 아니라 **조종이 서툰 것**이고, 그 자로는 아무것도 못 잰다.
 */
const { openHeadless } = await import("../../src/lib/video/headless");
const { playThrough } = await import("../../src/lib/skills/appBuild/playThrough");
const { readFileSync } = await import("node:fs");
const 판: [string, string, string][] = [
  ["원본", "engine/work/stage4-run1/origin/index.html", "클리어"],
  ["판6 (사장님: 클리어가 안돼)", "engine/work/stage4-run6/round1/index.html", "클리어 아님"],
  ["판7 (사장님: 높이가 높아서)", "engine/work/stage4-run7/round1/index.html", "클리어 아님"],
  ["판8 (오름 쌍 6개 막힘)", "engine/work/stage4-run8/round1/index.html", "클리어 아님"],
];
const hl = await openHeadless({ width: 1280, height: 720 });
if (!hl) process.exit(1);
let bad = 0;
try {
  for (const [이름, path, 기대] of 판) {
    const page = await hl.browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (r) => { const u = r.url(); if (u.startsWith("data:") || u === "about:blank") void r.continue(); else void r.abort(); });
    await page.setContent(readFileSync(path, "utf8"), { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 500));
    const r = await playThrough(page, 4000);
    await page.close();
    const 맞나 = 기대 === "클리어" ? r.끝 === "클리어" : r.끝 !== "클리어";
    if (!맞나) bad++;
    console.log(`${맞나 ? "맞음 " : "어긋남"} ${이름} → **${r.끝}** (무대 ${r.닿은무대}/3 · 목숨 잃음 ${r.잃은목숨} · ${r.걸린틱}틱 · ${r.시도}번째 시도, 앞 ${r.뛴자리px}px)${r.why ? " · " + r.why : ""}`);
  }
} finally { await hl.close(); }
console.log(`\n${bad ? `**어긋남 ${bad}판** — 이 자는 아직 3번 칸을 못 넘긴다` : "**전부 맞음** — 원본은 깨고 나머지는 못 깬다"}`);
process.exit(bad ? 1 : 0);
