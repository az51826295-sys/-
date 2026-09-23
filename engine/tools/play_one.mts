/** 파일 하나를 끝까지 해 본다. */
const { openHeadless } = await import("../../src/lib/video/headless");
const { playThrough } = await import("../../src/lib/skills/appBuild/playThrough");
const { readFileSync } = await import("node:fs");
const path = process.argv.find((a) => a.endsWith(".html"))!;
const hl = await openHeadless({ width: 1280, height: 720 });
if (!hl) { console.log("브라우저 없음"); process.exit(1); }
try {
  const page = await hl.browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (r) => { const u = r.url(); if (u.startsWith("data:") || u === "about:blank") void r.continue(); else void r.abort(); });
  await page.setContent(readFileSync(path, "utf8"), { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 500));
  const r = await playThrough(page, 4000);
  console.log(`${path} → **${r.끝}** (무대 ${r.닿은무대}/3 · 목숨 잃음 ${r.잃은목숨} · ${r.걸린틱}틱 · ${r.시도}번째 시도, 앞 ${r.뛴자리px}px)${r.why ? " · " + r.why : ""}`);
} finally { await hl.close(); }
