// 179회차 돌려 보기 자 시험 — 모델 없음, 돈 0. 멀쩡한 게임·깨진 게임·빈 게임 셋을 헤드리스 브라우저에서 돌려 사실이 맞게 나오는가.
//   npx tsx engine/tools/rookery_env.mts engine/tools/run_probe.mts
const { runWeb, factLines } = await import("../../src/lib/skills/appBuild/run");
const good = `<!doctype html><html><body style="margin:0;background:#123"><canvas id=c width=400 height=300></canvas><div id=s>점수 0</div>
<script>const c=document.getElementById('c'),x=c.getContext('2d');let px=50,t=0,score=0;function draw(){x.fillStyle='#123';x.fillRect(0,0,400,300);x.fillStyle='#fc0';x.fillRect(px,120,40,40);x.fillStyle='#fff';x.fillText('t='+t,10,20);}
setInterval(()=>{t++;px=(px+3)%360;draw();},100);addEventListener('keydown',e=>{if(e.code==='ArrowRight')px+=30;if(e.code==='ArrowLeft')px-=30;draw();});
c.addEventListener('pointerdown',()=>{score++;document.getElementById('s').textContent='점수 '+score;px+=10;draw();});draw();</script></body></html>`;
const broken = `<!doctype html><html><body><canvas id=c></canvas><script>const ctx=document.getElementById('nope').getContext('2d');</script></body></html>`;
const blank = `<!doctype html><html><body style="margin:0;background:#000"><script>fetch('https://example.com/x');</script></body></html>`;
for (const [name, html] of [["멀쩡", good], ["깨짐", broken], ["빈 화면+바깥 요청", blank]] as const) {
  const f = await runWeb([{ path: "index.html", contents: html, language: "html" }], { mobile: false });
  console.log(`\n== ${name} (${Math.round(f.ms / 100) / 10}초, 그림 ${Math.round(f.shots.start.length / 1024)}KB)`);
  for (const l of factLines(f)) console.log("  ", l);
}
