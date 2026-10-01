/**
 * **플레이 영상을 찍는다 — 소리까지** (228회차 10-01). 모델 0 · 값 0.
 *   npx tsx engine/work/sprites/녹화.mts [초=30]
 *
 * 사장님 "플레이 영상 찍어봐".
 *
 * ## 소리를 어떻게 넣나
 * 헤드리스 창에는 **스피커가 없다** — 화면만 찍으면 영상이 벙어리가 된다.
 * 그래서 창 안에서 **효과음이 울린 시각을 적어 두고**(sound.js 에 한 줄 심는다),
 * 그 시각표를 들고 **소리 트랙을 Node 에서 따로 만든다**. 합성 규칙은 sound.js 와 같은 것을 쓴다.
 * 들리는 소리가 게임이 낸 소리와 **같은 규칙·같은 시각**이라는 뜻이지, 창에서 녹음한 것은 아니다 — 그렇게 적는다.
 *
 * ## 화면
 * CDP 화면 중계(screencast)로 받는다. 사진을 한 장씩 찍으면 느려서 뚝뚝 끊긴다.
 * 프레임마다 온 시각이 있으니 **실제 시각 그대로** 이어 붙인다(빠르지도 느리지도 않게).
 */
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { openHeadless } from "../../../src/lib/video/headless";

const 초 = Number(process.argv[2] ?? 30);
const 뿌리 = "engine/work/ceiling/게임규격";
const 일터 = "engine/work/sprites/녹화칸";
const 낼곳 = "C:/Users/az518/Desktop/로키-도트게임-영상";
rmSync(일터, { recursive: true, force: true });
mkdirSync(`${일터}/장면`, { recursive: true });
mkdirSync(낼곳, { recursive: true });
const FF = ffmpegPath as unknown as string;

// ── 서버: sound.js 에 "울린 시각을 적는" 한 줄만 심어서 내준다 ──────────────
const 종류: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const 서버 = createServer((req, res) => {
  const 길 = normalize(join(뿌리, decodeURIComponent((req.url ?? "/").split("?")[0]))).split("\\").join("/");
  const 파일 = !extname(길) ? join(뿌리, "index.html") : 길;
  if (!파일.split("\\").join("/").startsWith(뿌리) || !existsSync(파일)) { res.writeHead(404); res.end(); return; }
  let 몸 = readFileSync(파일, "utf8");
  if (파일.endsWith("sound.js")) {
    const 앞 = 몸;
    몸 = 몸.replace("export function sfx(kind) {",
      "export function sfx(kind) {\n  (window.__소리기록 ??= []).push([performance.now(), kind]);");
    몸 = 몸.replace("export function startMusic(volume = 0.35) {",
      "export function startMusic(volume = 0.35) {\n  (window.__음악기록 ??= []).push(performance.now());");
    if (몸 === 앞) { console.error("소리 적는 줄을 못 심었다 — 영상 소리를 믿지 마라"); process.exit(1); }
  }
  res.writeHead(200, { "content-type": 종류[extname(파일)] ?? "text/plain" });
  res.end(몸);
});
await new Promise<void>((r) => 서버.listen(0, "127.0.0.1", () => r()));
const 포트 = (서버.address() as { port: number }).port;

const 창 = await openHeadless({ width: 1280, height: 860 });
if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }
const page = await 창.browser.newPage();
await page.setRequestInterception(true);
page.on("request", (r) => (r.url().includes(`127.0.0.1:${포트}`) ? r.continue() : r.abort()));
await page.goto(`http://127.0.0.1:${포트}/`, { waitUntil: "networkidle0" });
const 쉼 = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── 화면 중계 받기 ────────────────────────────────────────────────
const cdp = await page.createCDPSession();
const 장면: { 파일: string; 때: number }[] = [];
let 번호 = 0;
let 첫때 = 0;
cdp.on("Page.screencastFrame", async (f: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
  const t = (f.metadata.timestamp ?? 0) * 1000;
  if (!첫때) 첫때 = t;
  const p = `${일터}/장면/${String(++번호).padStart(5, "0")}.jpg`;
  writeFileSync(p, Buffer.from(f.data, "base64"));
  장면.push({ 파일: p, 때: t - 첫때 });
  try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch { /* 끝난 뒤 */ }
});

const 누르기 = async (x: number, y: number) => {
  const r = await page.evaluate(() => { const c = document.getElementById("gameCanvas")!.getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height }; });
  await page.mouse.click(r.l + (x * r.w) / 960, r.t + (y * r.h) / 600);
};
const 단추 = (id: string) => page.evaluate((i) => (document.getElementById(i) as HTMLElement)?.click(), id);

await cdp.send("Page.startScreencast", { format: "jpeg", quality: 82, maxWidth: 1280, maxHeight: 860, everyNthFrame: 1 });
const 시작시각 = Date.now();

// ── 놀아 본다 (영상에 보일 만큼) ──────────────────────────────────
await 쉼(1200);
await page.mouse.click(640, 430);        // 첫 누름 — 브라우저가 소리를 풀어 준다
await 단추("startButton");
await 쉼(1500);
for (const [고를것, x, y] of [["arrowTowerButton", 120, 60], ["cannonTowerButton", 230, 200], ["frostTowerButton", 455, 170]] as [string, number, number][]) {
  await 단추(고를것); await 쉼(500);
  await 누르기(x, y); await 쉼(1400);
}
await 쉼(3000);
await 누르기(120, 60);                    // 놓은 타워를 눌러 패널 열기
await 쉼(900);
await 단추("upgradeButton").catch(() => {});
await 쉼(600);
await 단추("closePanel").catch(() => {});
await 쉼(300);
await 단추("arrowTowerButton"); await 쉼(300);
await 누르기(330, 330); await 쉼(1200);
await 누르기(560, 330); await 쉼(1200);
while (Date.now() - 시작시각 < 초 * 1000) await 쉼(500);

await cdp.send("Page.stopScreencast").catch(() => {});
await 쉼(400);
const 소리기록 = await page.evaluate(() => ({
  소리: (window as unknown as { __소리기록?: [number, string][] }).__소리기록 ?? [],
  음악: (window as unknown as { __음악기록?: number[] }).__음악기록 ?? [],
  시작: performance.timeOrigin,
}));
await 창.close();
서버.close();

if (장면.length < 10) { console.error(`장면을 ${장면.length}장밖에 못 받았다`); process.exit(1); }
const 길이초 = (장면[장면.length - 1].때 - 장면[0].때) / 1000;
const fps = 장면.length / 길이초;
console.log(`장면 ${장면.length}장 · ${길이초.toFixed(1)}초 · 초당 ${fps.toFixed(1)}장`);
const 울린수: Record<string, number> = {};
for (const [, k] of 소리기록.소리) 울린수[k] = (울린수[k] ?? 0) + 1;
console.log(`소리 ${소리기록.소리.length}번: ${Object.entries(울린수).map(([k, n]) => `${k} ${n}`).join(" · ") || "(없음)"}`);
console.log(`음악 시작 ${소리기록.음악.length}번`);
writeFileSync(`${일터}/소리기록.json`, JSON.stringify(소리기록, null, 1));

// ── 소리 트랙을 만든다 (sound.js 와 **같은 규칙**) ─────────────────────
const SR = 48000;
const 총샘플 = Math.ceil((길이초 + 0.6) * SR);
const 왼 = new Float32Array(총샘플);
const 설정: Record<string, { wave: OscillatorType; from: number; to: number; len: number; gain: number; noise?: boolean }> = {
  shoot: { wave: "square", from: 880, to: 440, len: 0.07, gain: 0.05 },
  hit: { wave: "square", from: 320, to: 120, len: 0.09, gain: 0.10, noise: true },
  kill: { wave: "triangle", from: 520, to: 70, len: 0.26, gain: 0.11 },
  place: { wave: "triangle", from: 300, to: 620, len: 0.14, gain: 0.08 },
  upgrade: { wave: "square", from: 520, to: 1040, len: 0.20, gain: 0.07 },
  deny: { wave: "sawtooth", from: 180, to: 110, len: 0.16, gain: 0.07 },
  leak: { wave: "sawtooth", from: 260, to: 90, len: 0.34, gain: 0.10 },
  wave: { wave: "square", from: 440, to: 880, len: 0.28, gain: 0.07 },
  over: { wave: "triangle", from: 330, to: 60, len: 0.80, gain: 0.12 },
};
/** 네모·세모·톱니 한 음을 적어 넣는다. 높이는 from→to 로 지수로 미끄러진다(WebAudio 와 같게). */
function 음넣기(시작초: number, 결: OscillatorType, from: number, to: number, len: number, 세기: number, 감쌈: "exp" | "adsr" = "exp") {
  const i0 = Math.max(0, Math.floor(시작초 * SR));
  const n = Math.floor(len * SR);
  let 위상 = 0;
  for (let i = 0; i < n; i++) {
    const j = i0 + i; if (j >= 총샘플) break;
    const u = i / n;
    const f = from * Math.pow(Math.max(20, to) / from, u);
    위상 += (2 * Math.PI * f) / SR;
    let s = 0;
    if (결 === "square") s = Math.sin(위상) >= 0 ? 1 : -1;
    else if (결 === "triangle") s = (2 / Math.PI) * Math.asin(Math.sin(위상));
    else s = 2 * (((위상 / (2 * Math.PI)) % 1)) - 1;            // sawtooth
    const g = 감쌈 === "exp"
      ? 세기 * Math.pow(0.0001 / 세기, u)
      : 세기 * (u < 0.02 ? u / 0.02 : u > 0.7 ? Math.max(0, 1 - (u - 0.7) / 0.3) : 1);
    왼[j] += s * g;
  }
}
function 잡음넣기(시작초: number, len: number, 세기: number) {
  const i0 = Math.max(0, Math.floor(시작초 * SR)), n = Math.floor(len * SR);
  for (let i = 0; i < n; i++) { const j = i0 + i; if (j >= 총샘플) break; 왼[j] += (Math.random() * 2 - 1) * 세기 * (1 - i / n); }
}

// 효과음 — 적어 둔 시각 그대로
const 기준 = 장면[0].때 + (소리기록.소리.length ? 0 : 0);
void 기준;
const 첫프레임시각 = 첫때;                                  // performance.now 기준이 아니다 — 아래서 맞춘다
void 첫프레임시각;
// 화면 시각(CDP) 과 창 시각(performance.now) 의 0 점이 다르다. 첫 소리/첫 프레임을 같은 0 으로 두지 않고,
// **창 시각 그대로** 쓰되 녹화 시작(첫 조작 전)을 0 으로 맞춘다 — 어차피 둘 다 같은 창의 시계다.
const 창0 = 소리기록.소리.length ? Math.min(...소리기록.소리.map(([t]) => t)) : 0;
const 맞춤 = 창0 > 0 ? 창0 / 1000 - 1.2 : 0;                 // 첫 소리는 '시작' 누른 뒤 1.2초쯤
for (const [t, k] of 소리기록.소리) {
  const s = 설정[k]; if (!s) continue;
  const 때 = t / 1000 - 맞춤;
  if (때 < 0 || 때 > 길이초) continue;
  음넣기(때, s.wave, s.from, s.to, s.len, s.gain);
  if (s.noise) 잡음넣기(때, 0.05, 0.06);
}
// 배경 가락 — sound.js 와 같은 가락·빠르기
if (소리기록.음악.length) {
  const 가락: [number, number][] = [[0, 2], [4, 2], [7, 2], [12, 2], [7, 2], [4, 2], [7, 2], [4, 2],
  [-3, 2], [0, 2], [4, 2], [9, 2], [4, 2], [0, 2], [4, 2], [0, 2],
  [-7, 2], [-3, 2], [0, 2], [5, 2], [0, 2], [-3, 2], [0, 2], [5, 2],
  [-5, 2], [-1, 2], [2, 2], [7, 2], [2, 2], [-1, 2], [2, 2], [-1, 2]];
  const 베이스 = [0, 0, -3, -3, -7, -7, -5, -5];
  const 한박 = 60 / 120 / 4, 음량 = 0.18;
  const 높이 = (반음: number) => 261.63 * Math.pow(2, 반음 / 12);
  let 때 = Math.max(0, 소리기록.음악[0] / 1000 - 맞춤), 자리 = 0;
  while (때 < 길이초) {
    const [반음, 칸] = 가락[자리 % 가락.length];
    음넣기(때, "square", 높이(반음 + 12), 높이(반음 + 12), 한박 * 칸 * 0.9, 음량 * 0.5, "adsr");
    if (자리 % 4 === 0) { const b = 높이(베이스[Math.floor(자리 / 4) % 베이스.length] - 12); 음넣기(때, "triangle", b, b, 한박 * 3.4, 음량, "adsr"); }
    if (자리 % 2 === 1) 잡음넣기(때, 0.03, 음량 * 0.25);
    때 += 한박 * 칸; 자리++;
  }
}

// WAV 로 쓴다(16비트 모노)
const pcm = Buffer.alloc(총샘플 * 2);
for (let i = 0; i < 총샘플; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(Math.max(-1, Math.min(1, 왼[i])) * 32767))), i * 2);
const 머리 = Buffer.alloc(44);
머리.write("RIFF", 0); 머리.writeUInt32LE(36 + pcm.length, 4); 머리.write("WAVE", 8);
머리.write("fmt ", 12); 머리.writeUInt32LE(16, 16); 머리.writeUInt16LE(1, 20); 머리.writeUInt16LE(1, 22);
머리.writeUInt32LE(SR, 24); 머리.writeUInt32LE(SR * 2, 28); 머리.writeUInt16LE(2, 32); 머리.writeUInt16LE(16, 34);
머리.write("data", 36); 머리.writeUInt32LE(pcm.length, 40);
writeFileSync(`${일터}/소리.wav`, Buffer.concat([머리, pcm]));

// ── 이어 붙인다 ──────────────────────────────────────────────────
const 결과 = `${낼곳}/도트타워디펜스-플레이.mp4`;
execFileSync(FF, ["-y",
  "-framerate", fps.toFixed(3), "-i", `${일터}/장면/%05d.jpg`,
  "-i", `${일터}/소리.wav`,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
  "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", 결과],
  { stdio: ["ignore", "ignore", "pipe"] });

const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
const j = JSON.parse(execFileSync(ffprobe.path, ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", 결과]).toString()) as
  { format: { duration: string; size: string }; streams: { codec_type: string }[] };
const 소리있나 = j.streams.some((s) => s.codec_type === "audio");
console.log(`\n**${Number(j.format.duration).toFixed(1)}초 · ${(Number(j.format.size) / 1048576).toFixed(1)}MB · 소리 ${소리있나 ? "있음" : "**없음**"}**`);
console.log(`→ ${결과}`);
