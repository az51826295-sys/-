/**
 * **잠그기 전에: 이 값들로 갈 길이 있나** (판 8 전에 만듦, 09-22).
 *
 * 판 7 은 잠근 값들이 **서로 불가능**해서 실패했다. 고치는 자리는 할 수 있는 일이 없었다.
 * 그리고 그 모순에는 **내 제약(가로 속도 고정)도 섞여 있었다** — 사장님이 짚으셨다:
 *
 * > *"부딪치는 조건을 전부, **누가 낸 조건인지까지** 같이 보여 줘야 합니다.
 * >  그래야 로키에게 되돌릴지, 로키 운영자가 제약을 풀지를 가를 수 있습니다."*
 *
 * 그래서 이 검사는 **되나/안 되나**로 끝나지 않는다. 안 되면 **어느 조건들이 부딪치는지**를
 * 하나씩 빼 보며 찾아내고, **낸 사람**을 붙여 돌려준다.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/guard_feasible.mts --proposal <json> [--free-speed]
 */
const { openHeadless } = await import("../../src/lib/video/headless");
const { jumpProbeSource } = await import("../../src/lib/skills/appBuild/webMeasures");
const { readFileSync } = await import("node:fs");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
type G = { measure: string; min?: number | null; max?: number | null; why?: string };
const p = JSON.parse(readFileSync(arg("--proposal")!, "utf8")) as { 난간: G[]; 안내값: G[] };
const 자유속도 = process.argv.includes("--free-speed");

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
  /** 한 조합을 재서 아홉 칸을 낸다 — 실제 자와 같은 뜻으로. */
  const 재기=(rise:number,hang:number,fall:number,peak:number,speed:number)=>{
    const dy=synth(rise,hang,fall,peak);
    let 최소=Infinity,못=0,오름=0;
    for(const st of up.plats){const ps=[...st].sort((a,b)=>a.x-b.x);
      for(let i=0;i+1<ps.length;i++){const A=ps[i],B=ps[i+1]; if(B.y>A.y)continue; 오름++;
        const x0=A.x+A.w-up.size.w,yA=A.y-up.size.h; let ok=false;
        for(let t=1;t<dy.length&&!ok;t++){const x=x0+speed*t,y=yA+dy[t],yP=yA+dy[t-1];
          if(x+up.size.w>B.x&&x<B.x+B.w&&yP+up.size.h<=B.y&&y+up.size.h>=B.y){ok=true;최소=Math.min(최소,(B.x+B.w)-(x+up.size.w));}}
        if(!ok)못++;}}
    return {
      "점프.높이px":peak, "점프.공중프레임":rise+hang+fall, "점프.상승프레임":rise,
      "점프.꼭대기프레임":hang, "점프.하강프레임":fall,
      "점프.하강나누기상승":Math.round((fall/Math.max(1,rise))*100)/100,
      "점프.못오르는발판":못, "점프.오르는발판쌍":오름,
      ...(최소===Infinity?{}:{"점프.착지여유최소px":Math.round(최소*10)/10}),
    } as Record<string,number>;
  };
  const 맞나=(m:Record<string,number>,g:G)=>{const v=m[g.measure]; if(v==null)return false;
    if(g.min!=null&&v<g.min)return false; if(g.max!=null&&v>g.max)return false; return true;};

  /** 조건 목록을 받아 만족하는 조합이 **하나라도** 있나. 있으면 그 조합을 돌려준다. */
  const 길찾기=(gs:G[])=>{
    const 속도들 = 자유속도 ? [4.8,4.4,4.0,3.8,3.6,3.2] : [up.size.speed];
    for (const peak of [100,110,120,130,140,150,160])
      for (const rise of [8,10,12,14,16,18,20,22,24])
        for (const hang of [0,2,4,6,8,10,12,14,16])
          for (const fall of [8,10,12,14,16,18,20,22,24])
            for (const sp of 속도들) {
              const m=재기(rise,hang,fall,peak,sp);
              if (gs.every(g=>맞나(m,g))) return { 조합:{peak,rise,hang,fall,speed:sp}, 값:m };
            }
    return null;
  };

  const 낸사람=(g:G)=> p.난간.includes(g) ? "로키(난간)" : "로키(안내값)";
  const 운영자제약: G[] = 자유속도 ? [] : [{ measure: "가로속도", min: up.size.speed, max: up.size.speed, why: "주문서: 점프 물리와 관련된 줄만 손댄다" }];
  const 전부 = [...p.난간, ...p.안내값];

  const 답 = 길찾기(전부);
  if (답) {
    console.log("**갈 길이 있다.** 예를 들면:");
    console.log(`  상승 ${답.조합.rise} · 꼭대기 ${답.조합.hang} · 하강 ${답.조합.fall} · 높이 ${답.조합.peak} · 가로 ${답.조합.speed}`);
    console.log(`  → ${Object.entries(답.값).map(([k,v])=>`${k.replace("점프.","")}=${v}`).join(" · ")}`);
    process.exit(0);
  }
  console.log("**갈 길이 없다.** 어느 조건이 부딪치는지 하나씩 빼 본다:\n");
  const 풀면된다: string[] = [];
  for (const g of 전부) {
    const 나머지 = 전부.filter(x=>x!==g);
    if (길찾기(나머지)) 풀면된다.push(`  · **${g.measure}** (${낸사람(g)}) — 이것만 빼면 길이 생긴다  [${g.min ?? "-"} ~ ${g.max ?? "-"}]`);
  }
  if (풀면된다.length) { console.log("하나만 풀어도 되는 것:"); console.log(풀면된다.join("\n")); }
  else console.log("  하나만 빼서는 안 풀린다 — 여러 개가 얽혀 있다.");
  if (!자유속도) {
    const 속도풀면 = (() => { const old = 자유속도; void old; return null; })();
    void 속도풀면;
    console.log(`\n**운영자 제약도 조건이다**: 가로 속도 ${up.size.speed} 고정 (${운영자제약[0].why})`);
    console.log("  `--free-speed` 로 다시 돌려 보면, 이 제약을 푸는 것으로 풀리는지 알 수 있다.");
  }
  process.exit(1);
} finally { await hl.close(); }
