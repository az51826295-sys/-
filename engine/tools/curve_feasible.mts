/**
 * **잠그기 전에 돌려 본다** — ㉠의 세 부분을 각각 숫자로 잡으려는데,
 * 그 셋을 동시에 만족하면서 난간(못 오르는 쌍 = 1)도 지킬 수 있는지 먼저 본다.
 * 못 맞출 숫자를 잠그면 판이 열리자마자 죽는다(사장님 규칙, 09-21).
 */
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

  // 곡선을 지어낸다: 상승은 감속하며 오르고(포물선), 꼭대기는 머물고, 하강은 가속하며 떨어진다.
  const synth = (rise: number, hang: number, fall: number, peak: number) => {
    const dy: number[] = [];
    for (let t = 1; t <= rise; t++) dy.push(-peak * (1 - Math.pow(1 - t / rise, 2)));
    for (let t = 0; t < hang; t++) dy.push(-peak);
    for (let t = 1; t <= fall; t++) dy.push(-peak * (1 - Math.pow(t / fall, 2)));
    return dy;
  };
  const 못오름 = (dy: number[]) => {
    let n = 0;
    for (const stage of up.plats) {
      const ps=[...stage].sort((a,b)=>a.x-b.x);
      for (let i=0;i+1<ps.length;i++){
        const A=ps[i],B=ps[i+1]; if (B.y>A.y) continue;
        const x0=A.x+A.w-up.size.w, yA=A.y-up.size.h; let ok=false;
        for (let t=1;t<dy.length&&!ok;t++){
          const x=x0+up.size.speed*t, y=yA+dy[t], yP=yA+dy[t-1];
          if (x+up.size.w>B.x && x<B.x+B.w && yP+up.size.h<=B.y && y+up.size.h>=B.y) ok=true;
        }
        if(!ok) n++;
      }
    }
    return n;
  };
  console.log(`원본(잰 것): 못 오름 ${못오름(up.rec.map(f=>f.y-up.ground))} · 상승 19 · 꼭대기 4 · 하강 21`);
  console.log(`지어낸 곡선으로 원본 흉내: 못 오름 ${못오름(synth(19,4,21,129.8))}\n`);
  console.log("후보들 (높이 129.8 고정):");
  for (const [r,h,f] of [[17,8,15],[16,9,14],[18,8,14],[17,10,13],[19,8,13],[16,12,12]] as [number,number,number][]) {
    const n = 못오름(synth(r,h,f,129.8));
    console.log(`  상승 ${r} · 꼭대기 ${h} · 하강 ${f} (공중 ${r+h+f}) · 하강÷상승 ${(f/r).toFixed(2)} → 못 오름 ${n} ${n===1?"✅":"❌"}`);
  }
} finally { await hl.close(); }
