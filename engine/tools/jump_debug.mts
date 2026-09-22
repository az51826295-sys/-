const { openHeadless } = await import("../../src/lib/video/headless");
const { readFileSync } = await import("node:fs");
const html = readFileSync(process.argv.find((a) => a.endsWith(".html"))!, "utf8");
const hl = await openHeadless({ width: 1280, height: 720 });
if (!hl) process.exit(1);
try {
  const page = await hl.browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (r) => { const u = r.url(); if (u.startsWith("data:") || u === "about:blank") void r.continue(); else void r.abort(); });
  await page.setContent(html, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 600));
  const out = await page.evaluate(`(async () => {
    const seen = [];
    for (let i = 0; i < 60; i++) { await new Promise(r => requestAnimationFrame(r)); seen.push({y: Math.round(player.y*100)/100, vy: Math.round(player.vy*100)/100, g: player.onGround, x: Math.round(player.x*10)/10}); }
    const plats = stages[stageIndex].platforms.map(p => ({x:p.x,y:p.y,w:p.w}));
    return { 앞10: seen.slice(0,10), 뒤5: seen.slice(-5), 발판: plats, 키높이: player.h };
  })()`);
  console.log(JSON.stringify(out, null, 1).slice(0, 1400));
} finally { await hl.close(); }
