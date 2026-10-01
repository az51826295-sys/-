/**
 * **소리 꾸러미** — 타격음은 코드로, 배경 음악은 Lyria 로 (228회차 10-01).
 *   npx tsx engine/tools/rookery_env.mts engine/work/sprites/소리만들기.mts [--music]
 *
 * 사장님 "소리 입히고 타격음도".
 *
 * ## 왜 둘을 다르게 하나
 * **타격음은 코드로 만든다.** 때릴 때마다 소리가 **바로** 나야 하는데, 음원 파일은 읽고 겹쳐 트는 데 손이 간다.
 * 짧은 "틱·퍽" 은 합성이 더 낫고 **0바이트·0원**이다. 도트 그림과도 결이 맞는다(옛 게임이 그렇게 했다).
 *
 * **배경 음악은 Lyria 로 뽑는다.** 분위기는 합성으로 못 만든다. 09-26 에 "한 열쇠로 61개가 열리는데
 * 음악은 한 번도 안 불렀다" 고 적어 뒀다 — 이미 산 힘이다.
 *
 * ## 크기가 문제다
 * 판은 바깥 요청이 막힌 창에서 돈다. 음악도 **글자로 담아야** 하는데 mp3 는 그림보다 훨씬 크다.
 * 그래서 **모노 · 48kbps · 20초** 로 줄인다. 그래도 크면 그때 판단한다 — 재 보고 정한다.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";

const 음악까지 = process.argv.includes("--music");
const 칸 = "engine/work/sprites";
mkdirSync(`${칸}/소리`, { recursive: true });
const FF = ffmpegPath as unknown as string;

let 음악DataUrl = "";
let 음악값 = 0;
if (음악까지) {
  const { makeMusic, lyriaConfigured } = await import("../../../src/lib/providers/lyria");
  if (!lyriaConfigured()) { console.error("GEMINI_API_KEY 가 없다 — 음악은 건너뛴다"); }
  else {
    console.log("배경 음악 뽑는 중… (lyria-3-clip-preview, $0.04)");
    const m = await makeMusic({
      model: "lyria-3-clip-preview",
      prompt: [
        "Upbeat retro chiptune loop for a pixel-art tower defense game.",
        "8-bit square lead, simple bass, light percussion, major key, steady marching tempo around 120 BPM.",
        "Cheerful and determined, not tense. No vocals. Loopable, consistent energy throughout.",
      ].join(" "),
    });
    writeFileSync(`${칸}/소리/bgm-원본.mp3`, m.mp3);
    음악값 = 0.04;
    console.log(`  원본 ${Math.round(m.mp3.length / 1024)}KB`);

    // **작게 줄인다** — 모노 · 48kbps · 앞 20초 · 끝에 1초 페이드(이어 틀 때 뚝 끊기지 않게).
    const 줄인것 = `${칸}/소리/bgm.mp3`;
    execFileSync(FF, ["-y", "-i", `${칸}/소리/bgm-원본.mp3`, "-t", "20", "-ac", "1", "-b:a", "48k",
      "-af", "afade=t=out:st=19:d=1", 줄인것], { stdio: ["ignore", "ignore", "pipe"] });
    const buf = readFileSync(줄인것);
    음악DataUrl = `data:audio/mpeg;base64,${buf.toString("base64")}`;
    console.log(`  줄인 것 ${Math.round(buf.length / 1024)}KB → 글자로 ${Math.round(음악DataUrl.length / 1024)}KB`);
  }
}

/**
 * 소리 꾸러미. **효과음은 전부 그 자리에서 만든다**(WebAudio) — 파일이 없다.
 * 첫 소리는 사람이 화면을 한 번 누른 뒤에야 난다(브라우저 규칙). 그래서 `unlockSound()` 를 둔다.
 */
const js = `// 로키가 만든 소리 꾸러미. **이 파일은 고치지 마라.**
// 효과음은 파일이 아니라 **그 자리에서 만든 소리**다(WebAudio) — 0바이트, 겹쳐 쳐도 안 밀린다.
// 쓰는 법:
//   import { unlockSound, sfx, startMusic, toggleMusic } from './sound.js';
//   document.addEventListener('pointerdown', unlockSound, { once: true });  // 브라우저가 첫 소리를 막는다
//   sfx('hit');        // 타격음 — 적이 맞을 때
//   sfx('shoot');      // 발사
//   sfx('kill');       // 적이 죽을 때
//   sfx('place');      // 타워 설치
//   sfx('upgrade');    // 강화
//   sfx('deny');       // 돈이 모자라거나 길 위라 안 될 때
//   sfx('leak');       // 적이 끝까지 갔을 때(목숨 -1)
//   sfx('wave');       // 새 웨이브
//   sfx('over');       // 게임 오버
//   startMusic();      // 배경 음악(이어서 돈다) · toggleMusic() 로 켜고 끈다

let ac = null;
let 음악 = null;

export function unlockSound() {
  if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (C) ac = new C(); }
  if (ac && ac.state === 'suspended') ac.resume();
  return !!ac;
}

/** 소리 하나. 종류마다 파형·높이·길이가 다르다. */
export function sfx(kind) {
  if (!ac) unlockSound();
  if (!ac) return;
  const t = ac.currentTime;
  const 설정 = {
    shoot:   { wave: 'square',   from: 880,  to: 440,  len: 0.07, gain: 0.05 },
    hit:     { wave: 'square',   from: 320,  to: 120,  len: 0.09, gain: 0.10, noise: true },
    kill:    { wave: 'triangle', from: 520,  to: 70,   len: 0.26, gain: 0.11 },
    place:   { wave: 'triangle', from: 300,  to: 620,  len: 0.14, gain: 0.08 },
    upgrade: { wave: 'square',   from: 520,  to: 1040, len: 0.20, gain: 0.07 },
    deny:    { wave: 'sawtooth', from: 180,  to: 110,  len: 0.16, gain: 0.07 },
    leak:    { wave: 'sawtooth', from: 260,  to: 90,   len: 0.34, gain: 0.10 },
    wave:    { wave: 'square',   from: 440,  to: 880,  len: 0.28, gain: 0.07 },
    over:    { wave: 'triangle', from: 330,  to: 60,   len: 0.80, gain: 0.12 },
  }[kind];
  if (!설정) return;

  const g = ac.createGain();
  g.gain.setValueAtTime(설정.gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 설정.len);
  g.connect(ac.destination);

  const o = ac.createOscillator();
  o.type = 설정.wave;
  o.frequency.setValueAtTime(설정.from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, 설정.to), t + 설정.len);
  o.connect(g);
  o.start(t); o.stop(t + 설정.len);

  // 타격음에는 '퍽' 하는 잡음을 조금 섞는다 — 맑은 삐 소리만으로는 때린 느낌이 안 난다.
  if (설정.noise) {
    const n = ac.createBufferSource();
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.05), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    n.buffer = buf;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.06, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(ng); ng.connect(ac.destination);
    n.start(t);
  }
}

${음악DataUrl ? `const BGM = "${음악DataUrl}";` : `const BGM = "";   // 음원 없음 — 아래에서 **그 자리에서 연주한다**`}

/**
 * 배경 음악. 음원 파일이 있으면 그걸 틀고, 없으면 **그 자리에서 연주한다**.
 * 연주 쪽은 0바이트다 — 옛 게임이 그랬듯 네모파로 가락을 찍어 낸다.
 * 가락은 C 장조로 네 마디가 돌아간다(C - Am - F - G). 빠르기 120.
 */
const 가락 = [
  // [음높이(반음, 0 = C4), 길이(16분음표 수)] — 0.5마디씩 네 덩이
  [0, 2], [4, 2], [7, 2], [12, 2], [7, 2], [4, 2], [7, 2], [4, 2],
  [-3, 2], [0, 2], [4, 2], [9, 2], [4, 2], [0, 2], [4, 2], [0, 2],
  [-7, 2], [-3, 2], [0, 2], [5, 2], [0, 2], [-3, 2], [0, 2], [5, 2],
  [-5, 2], [-1, 2], [2, 2], [7, 2], [2, 2], [-1, 2], [2, 2], [-1, 2],
];
const 베이스 = [0, 0, -3, -3, -7, -7, -5, -5];   // 마디마다 두 번
const 한박 = 60 / 120 / 4;                        // 16분음표 한 칸(초)
const 높이 = (반음) => 261.63 * Math.pow(2, 반음 / 12);
let 연주중 = false, 다음때 = 0, 자리 = 0, 시계 = null, 음량 = 0.18;

function _한음(freq, 시작, 길이, 결, 세기) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, 시작);
  g.gain.linearRampToValueAtTime(세기, 시작 + 0.01);
  g.gain.setValueAtTime(세기, 시작 + 길이 * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, 시작 + 길이);
  g.connect(ac.destination);
  const o = ac.createOscillator();
  o.type = 결; o.frequency.setValueAtTime(freq, 시작);
  o.connect(g); o.start(시작); o.stop(시작 + 길이);
}

function _찍기() {
  if (!연주중 || !ac) return;
  // 0.2초 앞까지 미리 예약해 둔다 — 그래야 끊기지 않는다.
  while (다음때 < ac.currentTime + 0.2) {
    const [반음, 칸] = 가락[자리 % 가락.length];
    _한음(높이(반음 + 12), 다음때, 한박 * 칸 * 0.9, 'square', 음량 * 0.5);
    if (자리 % 4 === 0) _한음(높이(베이스[Math.floor(자리 / 4) % 베이스.length] - 12), 다음때, 한박 * 3.4, 'triangle', 음량);
    if (자리 % 2 === 1) {                      // 엇박에 하이햇
      const n = ac.createBufferSource();
      const b = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.03), ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      n.buffer = b;
      const g = ac.createGain();
      g.gain.setValueAtTime(음량 * 0.25, 다음때);
      g.gain.exponentialRampToValueAtTime(0.0001, 다음때 + 0.03);
      n.connect(g); g.connect(ac.destination); n.start(다음때);
    }
    다음때 += 한박 * 칸;
    자리++;
  }
}

/** 배경 음악을 튼다(이어서 돈다). 사람이 화면을 한 번 누른 뒤에 불러야 소리가 난다. */
export function startMusic(volume = 0.35) {
  if (!ac) unlockSound();
  if (!ac) return false;
  if (BGM) {
    if (!음악) { 음악 = new Audio(BGM); 음악.loop = true; }
    음악.volume = volume;
    음악.play().catch(() => {});
    return true;
  }
  if (연주중) return true;
  음량 = 0.18 * (volume / 0.35);
  연주중 = true; 자리 = 0; 다음때 = ac.currentTime + 0.05;
  시계 = setInterval(_찍기, 60);
  _찍기();
  return true;
}
export function stopMusic() {
  if (음악) 음악.pause();
  연주중 = false;
  if (시계) { clearInterval(시계); 시계 = null; }
}
/** 켜져 있으면 끄고, 꺼져 있으면 켠다. 켜졌는지를 돌려준다. */
export function toggleMusic() {
  const 켜짐 = BGM ? !!(음악 && !음악.paused) : 연주중;
  if (켜짐) { stopMusic(); return false; }
  startMusic(); return true;
}
export function hasMusic() { return true; }
`;

writeFileSync(`${칸}/sound.js`, js);
const kb = Math.round(js.length / 1024);
console.log(`\n**소리 꾸러미** ${kb}KB (효과음 9가지 + 배경 음악 ${음악DataUrl ? "있음" : "없음"})`);
console.log(`  ${칸}/sound.js`);
if (음악값) console.log(`  음악값 $${음악값.toFixed(2)}`);
if (existsSync(`${칸}/소리/bgm.mp3`)) {
  const p = "C:/Users/az518/Desktop/로키-도트조각/배경음악.mp3";
  writeFileSync(p, readFileSync(`${칸}/소리/bgm.mp3`));
  console.log(`  들어 보기: ${p}`);
}
