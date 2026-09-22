/** 발판 쌍마다 **여유가 얼마나**인지 — 닿는다/안 닿는다만 보면 아슬아슬한 것을 못 본다. */
const { openHeadless } = await import("../../src/lib/video/headless");
const { jumpProbeSource } = await import("../../src/lib/skills/appBuild/webMeasures");
const { readFileSync } = await import("node:fs");
const hl = await openHeadless({ width: 1280, height: 720 });
if (!hl) process.exit(1);
try {
  for (const [name, path] of [["원본","engine/work/stage4-run1/origin/index.html"],["판6","engine/work/stage4-run6/round1/index.html"]] as [string,string][]) {
    const page = await hl.browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (r) => { const u=r.url(); if (u.startsWith("data:")||u==="about:blank") void r.continue(); else void r.abort(); });
    await page.setContent(readFileSync(path,"utf8"), { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 600));
    const up = await page.evaluate(jumpProbeSource(false)) as { ground:number; rec:{y:number}[]; size:{w:number;h:number;speed:number}; plats:{x:number;y:number;w:number}[][] };
    const dy = up.rec.map((f)=>f.y-up.ground);
    console.log(`\n=== ${name} (높이 ${(-Math.min(...dy)).toFixed(1)}px) ===`);
    up.plats.forEach((stage, si) => {
      const ps=[...stage].sort((a,b)=>a.x-b.x);
      for (let i=0;i+1<ps.length;i++){
        const A=ps[i],B=ps[i+1]; if (B.y>A.y) continue;
        const x0=A.x+A.w-up.size.w, yA=A.y-up.size.h;
        // **여유**: 발판 B 의 왼쪽 끝을 지날 때 발밑이 B 위로 얼마나 떠 있나(px). 음수면 못 넘는다.
        let best=-9999, at=-1, landX=-1, landT=-1;
        for (let t=1;t<dy.length;t++){
          const x=x0+up.size.speed*t, y=yA+dy[t], yP=yA+dy[t-1];
          if (x+up.size.w>B.x && x<B.x+B.w) { const clear=B.y-(y+up.size.h); if (clear>best){best=clear;at=t;} }
          if (landT<0 && x+up.size.w>B.x && x<B.x+B.w && yP+up.size.h<=B.y && y+up.size.h>=B.y) { landT=t; landX=x; }
        }
        // **지나칠 뻔했나**: 내려앉은 자리에서 발판 오른쪽 끝까지 남은 거리. 작으면 조금만 더 떠도 넘어간다.
        const 남은 = landT<0 ? null : (B.x+B.w) - (landX+up.size.w);
        console.log(`  무대${si} ${i}→${i+1} (틈 ${B.x-(A.x+A.w)} · 오름 ${A.y-B.y}px): 머리 여유 ${best.toFixed(1)}px · ${landT<0?"**못 내려앉음**":`내려앉음 t=${landT} · 발판 오른쪽까지 ${남은!.toFixed(1)}px`}`);
      }
    });
    await page.close();
  }
} finally { await hl.close(); }
