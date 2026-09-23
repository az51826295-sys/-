/** 원본이 무대 2 에서 어디서 죽는지 — 죽기 직전 위치와 마지막으로 디딘 발판. */
const { openHeadless } = await import("../../src/lib/video/headless");
const { readFileSync } = await import("node:fs");
const path = process.argv.find((a) => a.endsWith(".html")) ?? "engine/work/stage4-run1/origin/index.html";
const hl = await openHeadless({ width: 1280, height: 720 });
if (!hl) { console.log("브라우저 없음"); process.exit(1); }
try {
  const page = await hl.browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (r) => { const u = r.url(); if (u.startsWith("data:") || u === "about:blank") void r.continue(); else void r.abort(); });
  await page.setContent(readFileSync(path, "utf8"), { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 500));
  const out = await page.evaluate(`(async () => {
    newGame();
    const deaths = []; let lastLives = lives, lastGround = null, ticks = 0, trail = [];
    const origDraw = draw;
    await new Promise((res) => {
      draw = function () {
        origDraw(); ticks++;
        const s = stages[stageIndex];
        if (player.onGround) { const p = s.platforms.find((p) => player.x + player.w > p.x && player.x < p.x + p.w && Math.abs((player.y + player.h) - p.y) < 3); if (p) lastGround = { stage: stageIndex, px: p.x, py: p.y, pw: p.w }; }
        trail.push({ t: ticks, s: stageIndex, x: Math.round(player.x), y: Math.round(player.y), vy: Math.round(player.vy * 10) / 10, g: player.onGround });
        if (trail.length > 40) trail.shift();
        if (lives < lastLives) { deaths.push({ at: ticks, stage: stageIndex + 1, lastGround, tail: trail.slice(-12) }); lastLives = lives; trail = []; }
        keys.right = true;
        const 발밑 = s.platforms.some((p) => player.x + player.w > p.x && player.x < p.x + p.w && Math.abs((player.y + player.h) - p.y) < 3);
        const 앞이빔 = !s.platforms.some((p) => player.x + player.w + 10 > p.x && player.x + 10 < p.x + p.w && p.y >= player.y + player.h - 2 && p.y <= player.y + player.h + 90);
        const 막힘 = Math.abs(player.vx) < 0.4 && player.onGround;
        if (player.onGround && (앞이빔 || 막힘 || !발밑)) tryJump();
        if (mode !== "playing" || ticks >= 3000) { keys.right = false; draw = origDraw; res(); }
      };
    });
    return { mode, stage: stageIndex + 1, deaths, plats2: stages[1].platforms.map((p) => [p.x, p.y, p.w]), flag: { x: 882, y: 155, w: 36, h: 310 } };
  })()`) as { mode: string; stage: number; deaths: { at: number; stage: number; lastGround: unknown; tail: { t: number; x: number; y: number; vy: number; g: boolean }[] }[]; plats2: number[][] };
  console.log(`끝: ${out.mode} · 무대 ${out.stage}`);
  console.log(`무대2 발판 [x,y,w]: ${JSON.stringify(out.plats2)}`);
  for (const d of out.deaths) {
    console.log(`\n죽음 #${out.deaths.indexOf(d) + 1} · 무대 ${d.stage} · 틱 ${d.at} · 마지막 발판 ${JSON.stringify(d.lastGround)}`);
    console.log("  " + d.tail.map((f) => `${f.x},${f.y}${f.g ? "·땅" : ""}`).join(" → "));
  }
} finally { await hl.close(); }
