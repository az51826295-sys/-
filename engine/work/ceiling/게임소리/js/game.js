(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const titleScreen = document.getElementById('title-screen');
  const endScreen = document.getElementById('end-screen');
  const hud = document.getElementById('hud');
  const waveLabel = document.getElementById('wave-label');
  const baseLabel = document.getElementById('base-label');
  const soundButton = document.getElementById('sound-button');
  const endTitle = document.getElementById('end-title');
  const endMessage = document.getElementById('end-message');

  const W = canvas.width, H = canvas.height;
  const pathY = 300;
  let state = 'title';
  let wave = 0;
  let baseHealth = 20;
  let enemies = [];
  let shots = [];
  let particles = [];
  let towers = [];
  let spawnLeft = 0;
  let spawnTimer = 0;
  let nextWaveTimer = 0;
  let lastTime = 0;
  let lastShootSound = -Infinity;
  let audioEnabled = true;
  let audioContext = null;
  let musicTimer = null;
  let musicStep = 0;

  const towerSpots = [
    { x: 150, y: 220, kind: 0 }, { x: 310, y: 380, kind: 1 },
    { x: 470, y: 205, kind: 0 }, { x: 630, y: 385, kind: 1 },
    { x: 790, y: 220, kind: 0 }, { x: 875, y: 385, kind: 1 }
  ];

  function resetGame() {
    state = 'playing'; wave = 0; baseHealth = 20; enemies = []; shots = []; particles = [];
    towers = towerSpots.map((s, i) => ({ ...s, cooldown: i * 0.08, level: 1 }));
    titleScreen.style.display = 'none'; endScreen.style.display = 'none'; hud.style.display = 'flex';
    beginNextWave(); updateHud();
  }

  function beginNextWave() {
    wave++;
    if (wave > 10) { finish(true); return; }
    spawnLeft = 5 + wave * 2;
    spawnTimer = 0.15;
    nextWaveTimer = 0;
    updateHud();
  }

  function updateHud() {
    waveLabel.textContent = `${Math.min(wave, 10)} / 10`;
    baseLabel.textContent = String(Math.max(0, baseHealth));
  }

  function spawnEnemy() {
    const armored = wave >= 4 && Math.random() < Math.min(.35, wave * .035);
    const hp = 25 + wave * 10 + (armored ? 22 : 0);
    enemies.push({ x: -24, y: pathY + (Math.random() - .5) * 32, hp, maxHp: hp, speed: 27 + wave * 1.8 + Math.random() * 8, radius: armored ? 17 : 14, armored, hitFlash: 0, wobble: Math.random() * 6.28 });
    spawnLeft--;
  }

  function damageEnemy(enemy, amount) {
    enemy.hp -= amount;
    enemy.hitFlash = .1;
    burst(enemy.x, enemy.y, '#fde68a', 3);
    if (enemy.hp <= 0) {
      const index = enemies.indexOf(enemy);
      if (index !== -1) enemies.splice(index, 1);
      burst(enemy.x, enemy.y, enemy.armored ? '#c084fc' : '#fb7185', 12);
      beep(110 + Math.random() * 45, .07, 'square', .045);
    }
  }

  function fire(tower, target) {
    tower.cooldown = tower.kind ? .52 : .37;
    shots.push({ x: tower.x, y: tower.y, target, speed: 560, damage: tower.kind ? 18 : 13, color: tower.kind ? '#67e8f9' : '#fbbf24' });
    // This timestamp is shared by every tower: no shoot sound can be less than 80ms apart.
    const now = performance.now();
    if (audioEnabled && now - lastShootSound >= 80) {
      lastShootSound = now;
      beep(tower.kind ? 520 : 390, .045, 'square', .025);
    }
  }

  function update(dt) {
    if (state !== 'playing') return;
    if (spawnLeft > 0) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) { spawnEnemy(); spawnTimer = Math.max(.23, .68 - wave * .025); }
    } else if (enemies.length === 0 && shots.length === 0) {
      nextWaveTimer += dt;
      if (nextWaveTimer > 1.1) beginNextWave();
    }

    for (const enemy of enemies) {
      enemy.x += enemy.speed * dt; enemy.hitFlash = Math.max(0, enemy.hitFlash - dt); enemy.wobble += dt * 5;
      if (enemy.x > W + 25) { enemy.dead = true; baseHealth--; updateHud(); burst(W - 20, enemy.y, '#f87171', 7); }
    }
    enemies = enemies.filter(e => !e.dead);
    if (baseHealth <= 0) { finish(false); return; }

    for (const tower of towers) {
      tower.cooldown -= dt;
      if (tower.cooldown <= 0) {
        let target = null, best = -Infinity;
        for (const enemy of enemies) {
          const dx = enemy.x - tower.x, dy = enemy.y - tower.y;
          if (dx * dx + dy * dy < 205 * 205 && enemy.x > best) { best = enemy.x; target = enemy; }
        }
        if (target) fire(tower, target);
      }
    }

    for (let i = shots.length - 1; i >= 0; i--) {
      const shot = shots[i];
      if (!shot.target || !enemies.includes(shot.target)) { shots.splice(i, 1); continue; }
      const dx = shot.target.x - shot.x, dy = shot.target.y - shot.y, d = Math.hypot(dx, dy);
      const step = shot.speed * dt;
      if (d < step + 5) { damageEnemy(shot.target, shot.damage); shots.splice(i, 1); }
      else { shot.x += dx / d * step; shot.y += dy / d * step; }
    }
    updateParticles(dt);
  }

  function draw() {
    ctx.fillStyle = '#172033'; ctx.fillRect(0, 0, W, H);
    drawBackground();
    drawPath();
    for (const tower of towers) drawTower(tower);
    for (const shot of shots) { ctx.fillStyle = shot.color; ctx.fillRect(Math.round(shot.x - 4), Math.round(shot.y - 4), 8, 8); ctx.fillStyle = '#fff7ed'; ctx.fillRect(Math.round(shot.x - 1), Math.round(shot.y - 1), 3, 3); }
    for (const enemy of enemies) drawEnemy(enemy);
    drawParticles();
    if (state === 'playing' && spawnLeft === 0 && enemies.length === 0 && shots.length === 0 && nextWaveTimer > 0) {
      ctx.fillStyle = '#fef3c7'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center'; ctx.fillText(wave < 10 ? `웨이브 ${wave} 방어 완료` : '마지막 웨이브 정리 중...', W / 2, 54);
    }
  }

  function drawBackground() {
    ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, W, 160);
    ctx.fillStyle = '#263449';
    for (let x = 0; x < W; x += 32) for (let y = 20; y < 150; y += 32) ctx.fillRect(x + ((y / 32) % 2) * 8, y, 3, 3);
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 440, W, 100);
    ctx.fillStyle = '#334155'; for (let x = 0; x < W; x += 48) ctx.fillRect(x, 460 + (x % 3) * 7, 30, 4);
    // right-side keep
    ctx.fillStyle = '#475569'; ctx.fillRect(896, 150, 64, 290); ctx.fillStyle = '#64748b'; ctx.fillRect(908, 180, 40, 260);
    ctx.fillStyle = '#fbbf24'; ctx.fillRect(919, 205, 18, 45); ctx.fillStyle = '#fef3c7'; ctx.fillRect(923, 212, 10, 10);
  }

  function drawPath() {
    ctx.fillStyle = '#475569'; ctx.fillRect(0, pathY - 43, W, 86);
    ctx.fillStyle = '#64748b'; ctx.fillRect(0, pathY - 35, W, 70);
    ctx.fillStyle = '#7c8da5';
    for (let x = -20; x < W; x += 52) ctx.fillRect(x, pathY - 2, 25, 4);
    ctx.fillStyle = '#94a3b8'; ctx.fillRect(0, pathY - 43, W, 4); ctx.fillRect(0, pathY + 39, W, 4);
  }

  function drawTower(t) {
    ctx.fillStyle = '#0f172a'; ctx.fillRect(t.x - 25, t.y + 19, 50, 8);
    ctx.fillStyle = t.kind ? '#0891b2' : '#d97706'; ctx.fillRect(t.x - 20, t.y - 19, 40, 40);
    ctx.fillStyle = t.kind ? '#67e8f9' : '#fbbf24'; ctx.fillRect(t.x - 13, t.y - 29, 26, 13);
    ctx.fillStyle = '#1e293b'; ctx.fillRect(t.x - 7, t.y - 10, 14, 14);
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(t.x - 4, t.y - 8, 4, 4); ctx.fillRect(t.x + 4, t.y - 8, 4, 4);
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(t.x + 15, t.y - 5, 13, 7);
  }

  function drawEnemy(e) {
    const y = Math.round(e.y + Math.sin(e.wobble) * 2);
    ctx.fillStyle = e.hitFlash > 0 ? '#fff' : (e.armored ? '#9333ea' : '#e11d48');
    ctx.fillRect(Math.round(e.x - e.radius), y - e.radius, e.radius * 2, e.radius * 2);
    ctx.fillStyle = e.armored ? '#c084fc' : '#fb7185'; ctx.fillRect(e.x - e.radius + 4, y - e.radius + 4, e.radius * 2 - 8, 5);
    ctx.fillStyle = '#111827'; ctx.fillRect(e.x - 8, y - 5, 5, 5); ctx.fillRect(e.x + 4, y - 5, 5, 5);
    ctx.fillStyle = '#0f172a'; ctx.fillRect(e.x - 21, y - e.radius - 10, 42, 5);
    ctx.fillStyle = '#4ade80'; ctx.fillRect(e.x - 20, y - e.radius - 9, 40 * Math.max(0, e.hp / e.maxHp), 3);
  }

  function burst(x, y, color, count) { for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - .5) * 100, vy: (Math.random() - .5) * 100, life: .35 + Math.random() * .3, max: .6, color }); }
  function updateParticles(dt) { for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 100 * dt; p.life -= dt; } particles = particles.filter(p => p.life > 0); }
  function drawParticles() { for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); } ctx.globalAlpha = 1; }

  function finish(won) {
    state = won ? 'won' : 'lost'; stopMusic(); endScreen.style.display = 'grid';
    endTitle.textContent = won ? '요새 방어 성공!' : '요새가 함락되었습니다';
    endMessage.textContent = won ? '웨이브 10의 적까지 모두 막아냈습니다. 마지막 웨이브 완료!' : `웨이브 ${wave}에서 성벽이 무너졌습니다. 다시 도전해 보세요.`;
  }

  function ensureAudio() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
  }
  function beep(freq, duration, type, volume) {
    if (!audioEnabled) return;
    ensureAudio(); const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    osc.type = type; osc.frequency.value = freq; gain.gain.setValueAtTime(volume, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    osc.connect(gain).connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + duration);
  }
  function startMusic() {
    ensureAudio(); stopMusic(); musicStep = 0;
    musicTimer = setInterval(() => {
      if (!audioEnabled || state !== 'playing') return;
      const notes = [196, 247, 294, 247, 220, 262, 330, 262]; beep(notes[musicStep++ % notes.length], .12, 'triangle', .018);
    }, 280);
  }
  function stopMusic() { if (musicTimer !== null) { clearInterval(musicTimer); musicTimer = null; } }
  function setSound(on) { audioEnabled = on; soundButton.textContent = on ? '🔊 소리 켜짐' : '🔇 소리 꺼짐'; soundButton.setAttribute('aria-pressed', String(on)); if (on && state === 'playing') startMusic(); else if (!on) stopMusic(); }

  document.getElementById('start').addEventListener('click', () => { ensureAudio(); resetGame(); startMusic(); });
  document.getElementById('again').addEventListener('click', () => { ensureAudio(); resetGame(); startMusic(); });
  soundButton.addEventListener('click', () => { setSound(!audioEnabled); });

  function loop(now) { const dt = Math.min(.05, (now - lastTime) / 1000 || 0); lastTime = now; update(dt); draw(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
})();
