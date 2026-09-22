/** 잠근 값들이 **서로 가능한가** — 공중 프레임을 늘리면 착지 여유가 얼마나 줄어드나. */
const { openHeadless } = await import("../../src/lib/video/headless");
const { jumpProbeSource } = await import("../../src/lib/skills/appBuild/webMeasures");
const { readFileSync } = await import("node:fs");
const hl = await openHeadless({ width: 1280, height: 720 });
if (!hl) process.exit(1);
try {
  const page = await hl.browser.newPage();
  await page.setRequestInterception(true);
  page.on("request",(r)=>{const u=r.url(); if(u.startsWith("data:")||u==="about:blank") void r.continue(); else void r.abort();});
  await page.setContent(readFileSync("engine/work/stage4-run1/origin/index.html","utf8"),{waitUntil:"load"});
  await new Promise(r=>setTimeout(r,600));
  const up = await page.evaluate(jumpProbeSource(false)) as {ground:number;rec:{y:number}[];size:{w:number;h:number;speed:number};plats:{x:number;y:number;w:number}[][]};
  const synth=(rise:number,hang:number,fall:number,peak:number)=>{const d:number[]=[];for(let t=1;t<=rise;t++)d.push(-peak*(1-Math.pow(1-t/rise,2)));for(let t=0;t<hang;t++)d.push(-peak);for(let t=1;t<=fall;t++)d.push(-peak*(1-Math.pow(t/fall,2)));return d;};
  const 재기=(dy:number[], speed=up.size.speed)=>{let 최소=Infinity,못=0;
    for(const st of up.plats){const ps=[...st].sort((a,b)=>a.x-b.x);
      for(let i=0;i+1<ps.length;i++){const A=ps[i],B=ps[i+1]; if(B.y>A.y)continue;
        const x0=A.x+A.w-up.size.w,yA=A.y-up.size.h; let ok=false;
        for(let t=1;t<dy.length&&!ok;t++){const x=x0+speed*t,y=yA+dy[t],yP=yA+dy[t-1];
          if(x+up.size.w>B.x&&x<B.x+B.w&&yP+up.size.h<=B.y&&y+up.size.h>=B.y){ok=true;최소=Math.min(최소,(B.x+B.w)-(x+up.size.w));}}
        if(!ok)못++;}}
    return {못, 최소: 최소===Infinity?null:Math.round(최소*10)/10};};
  console.log("높이 130 고정 · 꼭대기 8프레임 · 공중 길이만 바꿔 가며:");
  for (const 공중 of [38,40,41,42,44,46,49,52,58]) {
    const rise=Math.round((공중-8)*0.52), fall=공중-8-rise;
    const r=재기(synth(rise,8,fall,130));
    const 난간 = r.최소!==null && r.최소>=8 && r.못===1;
    console.log(`  공중 ${공중}프레임 → 착지여유 ${r.최소}px · 못오름 ${r.못} ${난간?"✅ 난간 안":"❌ **난간 밖**"}`);
  }
  // **부딪친 조건에 내 제약이 섞여 있나**(사장님 09-22).
  // "공중에 오래 떠 있으면 발판을 지나친다" 는 **가로 속도를 못 바꾼다는 전제** 위에서만 성립한다.
  // 그 전제는 로키가 낸 것이 아니라 내가 주문서에 넣은 것이다("점프 물리와 관련된 줄만 손댄다").
  {
    console.log("");
    console.log("가로 속도를 풀면? (공중 49프레임 · 꼭대기 8 · 높이 130 고정)");
    const dy = synth(Math.round((49-8)*0.52), 8, 49-8-Math.round((49-8)*0.52), 130);
    for (const sp of [4.8, 4.4, 4.0, 3.8, 3.6, 3.2]) {
      const r = 재기(dy, sp);
      const ok = r.최소!==null && r.최소>=8 && r.못===1;
      console.log(`  가로 ${sp}px/프레임 → 착지여유 ${r.최소}px · 못오름 ${r.못} ${ok?"✅ **난간 안**":"❌"}`);
    }
  }

} finally { await hl.close(); }