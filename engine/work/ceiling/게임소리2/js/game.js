import { sprite, spritesReady } from './sprites.js';
import { unlockSound, sfx, startMusic, toggleMusic } from './sound.js';
document.addEventListener('pointerdown', unlockSound, { once: true });

await spritesReady();

(() => {
  'use strict';
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;
  const $ = id => document.getElementById(id);
  const title = $('titleScreen'), over = $('gameOverScreen'), hud = $('hud');
  const panel = $('towerPanel');
  const path = [{x:-20,y:112},{x:170,y:112},{x:170,y:260},{x:410,y:260},{x:410,y:105},{x:680,y:105},{x:680,y:420},{x:900,y:420},{x:980,y:510}];
  let money=150, lives=20, wave=1, running=false, paused=false, last=0, spawnClock=0, selected=null;
  let enemies=[], towers=[], spawned=0, wavePause=0, shootCooldown=0, selectedTowerKind='tower_arrow';
  let soundOn=true;
  const bestKey='dotTowerBestWave';
  const best=()=>Number(localStorage.getItem(bestKey)||0);
  $('titleBest').textContent=best();

  function reset(){money=150;lives=20;wave=1;enemies=[];towers=[];spawned=0;spawnClock=0;wavePause=0;shootCooldown=0;selected=null;paused=false;running=true;title.classList.add('hidden');over.classList.add('hidden');hud.classList.remove('hidden');panel.classList.add('hidden');startMusic();sfx('wave');updateHud()}
  function updateHud(){$('money').textContent=money;$('lives').textContent=lives;$('wave').textContent=wave}
  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function pointLine(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy))}
  function onRoad(x,y){for(let i=0;i<path.length-1;i++)if(pointLine({x,y},path[i],path[i+1])<34)return true;return false}
  function pixelSprite(x,y,scale,rows,palette){rows.forEach((row,ry)=>[...row].forEach((c,rx)=>{if(c!=='.'){ctx.fillStyle=palette[c]||c;ctx.fillRect(Math.round(x+rx*scale),Math.round(y+ry*scale),scale,scale)}}))}
  function drawScene(){
    ctx.fillStyle='#79b99b';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(255,255,255,.08)';for(let x=0;x<W;x+=48)for(let y=0;y<H;y+=48)ctx.fillRect(x,y,2,2);
    ctx.lineCap='square';ctx.lineJoin='round';ctx.strokeStyle='#38546a';ctx.lineWidth=78;ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);path.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();
    ctx.strokeStyle='#bf9762';ctx.lineWidth=62;ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);path.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();
    ctx.strokeStyle='#e0ba78';ctx.lineWidth=3;ctx.setLineDash([5,10]);ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);path.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();ctx.setLineDash([]);
    // entrance and castle
    pixelSprite(16,78,5,['..333.','..333.','..333.','..333.','333333','3.3333','333333'],{'3':'#e8d49b'});
    pixelSprite(895,465,5,['.4444.','444444','4.44.4','444444','44..44','444444','4....4'],{'4':'#d96868'});
    towers.forEach(t=>{ctx.fillStyle='rgba(17,29,48,.25)';ctx.fillRect(t.x-20,t.y+16,40,7);drawTower(t)});
    enemies.forEach(e=>drawEnemy(e));
    if(paused&&running){ctx.fillStyle='rgba(10,20,35,.55)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff4d6';ctx.font='24px monospace';ctx.textAlign='center';ctx.fillText('일시정지',W/2,H/2);ctx.textAlign='left'}
  }
  function drawTower(t){ctx.drawImage(sprite(t.kind),t.x-24,t.y-24,48,48);ctx.fillStyle='#fff4d6';ctx.font='10px monospace';ctx.fillText('L'+t.level,t.x-12,t.y+30)}
  function drawEnemy(e){const bob=Math.sin(e.anim)*2;ctx.drawImage(sprite(e.kind),e.x-24,e.y-24+bob,48,48);ctx.fillStyle='#35233d';ctx.fillRect(e.x-22,e.y-34,44,5);ctx.fillStyle='#72df9c';ctx.fillRect(e.x-22,e.y-34,44*Math.max(0,e.hp/e.maxHp),5)}
  function advanceEnemy(e,dt){let remain=e.speed*dt;while(remain>0&&e.seg<path.length-1){const target=path[e.seg+1],d=dist(e,target);if(d<=remain){e.x=target.x;e.y=target.y;e.seg++;remain-=d}else{e.x+=(target.x-e.x)*remain/d;e.y+=(target.y-e.y)*remain/d;remain=0}}e.anim+=dt*8;if(e.seg>=path.length-1){e.dead=true;lives--;sfx('leak');updateHud();if(lives<=0)gameOver()}}
  function spawn(){const hp=38+wave*15;const kinds=['enemy_weak','enemy_fast','enemy_tank'];enemies.push({x:path[0].x,y:path[0].y,seg:0,speed:38+wave*2,hp,maxHp:hp,anim:0,kind:kinds[spawned%3]})}
  function update(dt){if(!running||paused)return;shootCooldown-=dt;spawnClock+=dt;if(spawned<5+wave*2&&spawnClock>.8){spawn();spawned++;spawnClock=0}if(spawned>=5+wave*2&&enemies.length===0){wave++;spawned=0;wavePause=1.1;money+=25;sfx('wave');updateHud()}if(wavePause>0)wavePause-=dt;enemies.forEach(e=>{if(!e.dead)advanceEnemy(e,dt)});enemies=enemies.filter(e=>!e.dead);towers.forEach(t=>{t.cool-=dt;if(t.cool<=0){let target=enemies.filter(e=>!e.dead&&dist(t,e)<t.range).sort((a,b)=>dist(t,a)-dist(t,b))[0];if(target){if(shootCooldown<=0){sfx('shoot');shootCooldown=.08}target.hp-=t.damage;sfx('hit');t.cool=.55;if(target.hp<=0){target.dead=true;money+=12;sfx('kill');updateHud()}}}});enemies=enemies.filter(e=>!e.dead)}
  function gameOver(){running=false;sfx('over');hud.classList.add('hidden');panel.classList.add('hidden');$('finalWave').textContent=wave;const old=best();if(wave>old)localStorage.setItem(bestKey,wave);over.classList.remove('hidden')}
  function canvasPoint(ev){const r=canvas.getBoundingClientRect();return{x:(ev.clientX-r.left)*W/r.width,y:(ev.clientY-r.top)*H/r.height}}
  canvas.addEventListener('click',ev=>{if(!running||paused)return;const p=canvasPoint(ev);const hit=towers.find(t=>dist(t,p)<25);if(hit){selected=hit;showPanel();return}if(p.y>H-55||onRoad(p.x,p.y)){sfx('deny');return}const x=Math.round(p.x/48)*48+24,y=Math.round(p.y/48)*48+24;if(x>W-30||y>H-20||onRoad(x,y)||towers.some(t=>dist(t,{x,y})<42)){sfx('deny');return}if(money>=60){money-=60;towers.push({x,y,kind:selectedTowerKind,level:1,damage:18,range:125,cool:0});sfx('place');updateHud()}else{sfx('deny')}});
  function showPanel(){panel.classList.remove('hidden');$('towerInfo').textContent=`타워 L${selected.level} · 공격 ${selected.damage} · 사거리 ${selected.range}`;$('upgradeButton').textContent=`업그레이드 (₩${50+selected.level*25})`}
  $('upgradeButton').onclick=()=>{if(!selected)return;const cost=50+selected.level*25;if(money>=cost){money-=cost;selected.level++;selected.damage+=12;selected.range+=18;sfx('upgrade');updateHud();showPanel()}else{sfx('deny')}};
  $('closePanel').onclick=()=>{selected=null;panel.classList.add('hidden')};$('pauseButton').onclick=()=>{if(running){paused=!paused;$('pauseButton').textContent=paused?'계속':'일시정지'}};$('arrowTowerButton').onclick=()=>{selectedTowerKind='tower_arrow'};$('cannonTowerButton').onclick=()=>{selectedTowerKind='tower_cannon'};$('frostTowerButton').onclick=()=>{selectedTowerKind='tower_frost'};$('soundButton').onclick=()=>{toggleMusic();soundOn=!soundOn;$('soundButton').textContent=soundOn?'🔊 소리 켜짐':'🔇 소리 꺼짐'};$('startButton').onclick=reset;$('retryButton').onclick=reset;
  function frame(now){const dt=Math.min(.05,(now-last)/1000||0);last=now;update(dt);drawScene();requestAnimationFrame(frame)}requestAnimationFrame(frame);
})();
