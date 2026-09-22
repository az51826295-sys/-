/** 곡선을 조금씩 낮춰 가며 **언제 못 오르는 쌍이 늘어나는지** 잰다 — 허용 오차를 눈대중으로 안 고르려고. */
const { openHeadless } = await import("../../src/lib/video/headless");
const { jumpProbeSource } = await import("../../src/lib/skills/appBuild/webMeasures");
const { readFileSync } = await import("node:fs");
const hl = await openHeadless({ width: 1280, height: 720 });
if (!hl) process.exit(1);
try {
  const page = await hl.browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (r) => { const u=r.url(); if (u.startsWith("data:")||u==="about:blank") void r.continue(); else void r.abort(); });
  await page.setContent(readFileSync("engine/work/stage4-run1/origin/index.html","utf8"), { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 600));
  const up = await page.evaluate(jumpProbeSource(false)) as { ground:number; rec:{y:number}[]; size:{w:number;h:number;speed:number}; plats:{x:number;y:number;w:number}[][] };
  const dy0 = up.rec.map((f) => f.y - up.ground);
  const 높이0 = -Math.min(...dy0);
  const 세기 = (k: number) => {
    const dy = dy0.map((v) => v * k);
    let 못오름 = 0;
    for (const stage of up.plats) {
      const ps=[...stage].sort((a,b)=>a.x-b.x);
      for (let i=0;i+1<ps.length;i++){
        const A=ps[i],B=ps[i+1]; if (B.y>A.y) continue;
        const x0=A.x+A.w-up.size.w, yA=A.y-up.size.h; let ok=false;
        for (let t=1;t<dy.length&&!ok;t++){
          const x=x0+up.size.speed*t, y=yA+dy[t], yP=yA+dy[t-1];
          if (x+up.size.w>B.x && x<B.x+B.w && yP+up.size.h<=B.y && y+up.size.h>=B.y) ok=true;
        }
        if(!ok) 못오름++;
      }
    }
    return 못오름;
  };
  console.log(`원본 높이 ${높이0.toFixed(1)}px · 못 오르는 쌍 ${세기(1)}`);
  let 깨진곳 = null;
  for (let k = 1.0; k >= 0.5; k -= 0.01) {
    const n = 세기(k);
    if (n > 세기(1)) { 깨진곳 = { k, 높이: 높이0 * k, n }; break; }
  }
  if (깨진곳) console.log(`**${깨진곳.높이.toFixed(1)}px 에서 못 오르는 쌍이 ${깨진곳.n} 로 늘어난다** (원본보다 ${(높이0-깨진곳.높이).toFixed(1)}px 낮음)`);
  else console.log("0.5배까지 낮춰도 안 늘어난다");
  for (let k = 1.0; k <= 1.3; k += 0.05) console.log(`  ${(높이0*k).toFixed(1)}px (×${k.toFixed(2)}) → 못 오름 ${세기(k)}`);
} finally { await hl.close(); }
