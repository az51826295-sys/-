const { openHeadless } = await import("../../src/lib/video/headless");
const { jumpProbeSource } = await import("../../src/lib/skills/appBuild/webMeasures");
const { readFileSync } = await import("node:fs");
const html = readFileSync(process.argv[process.argv.length-1], "utf8");
const hl = await openHeadless({ width: 1280, height: 720 });
if (!hl) process.exit(1);
try {
  const page = await hl.browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (r) => { const u=r.url(); if (u.startsWith("data:")||u==="about:blank") void r.continue(); else void r.abort(); });
  await page.setContent(html, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 600));
  const up = await page.evaluate(jumpProbeSource(false)) as { ground: number; rec: {x:number;y:number}[]; size: {w:number;h:number;speed:number}; plats: {x:number;y:number;w:number}[][] };
  console.log(`땅 ${up.ground} · 크기 ${JSON.stringify(up.size)} · 무대 ${up.plats.length}개`);
  const dy = up.rec.map((f) => f.y - up.ground);
  console.log(`곡선 ${dy.length}틱 · 최고 ${Math.min(...dy).toFixed(1)}`);
  up.plats.forEach((stage, si) => {
    const ps = [...stage].sort((a,b)=>a.x-b.x);
    console.log(`무대 ${si}: ${ps.map(p=>`(x${p.x} y${p.y} w${p.w})`).join(" ")}`);
    for (let i=0;i+1<ps.length;i++) {
      const A=ps[i],B=ps[i+1];
      const x0=A.x+A.w-up.size.w, yA=A.y-up.size.h;
      let hit=-1;
      for (let t=1;t<dy.length&&hit<0;t++){
        const x=x0+up.size.speed*t, y=yA+dy[t], yP=yA+dy[t-1];
        if (x+up.size.w>B.x && x<B.x+B.w && yP+up.size.h<=B.y && y+up.size.h>=B.y) hit=t;
      }
      const 틈=B.x-(A.x+A.w), 높이차=A.y-B.y;
      console.log(`  ${i}→${i+1}: 틈 ${틈}px · 높이차 ${높이차}px · ${hit>=0?`닿음(t=${hit})`:"**못 닿음**"}`);
    }
  });
} finally { await hl.close(); }
