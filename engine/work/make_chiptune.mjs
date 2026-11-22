// 릴스 배경음 — 코드로 직접 만든 8비트 반주(남의 음원 없음 → 저작권 걱정 없음).
// C–Am–F–G 를 한 마디씩 돌린다. 펄스파 아르페지오 + 사각파 베이스 + 잡음 하이햇. 끝 2초 페이드아웃.
import { writeFileSync } from "node:fs";
const SEC = Number(process.argv[3] ?? 42);
const OUT = process.argv[2] ?? "bgm.wav";
const SR = 44100, BPM = 112, BEAT = 60 / BPM;
const N = Math.floor(SEC * SR);
const buf = new Float32Array(N);
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
// 화음(미디 번호): C, Am, F, G
const CHORDS = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2]; // 8분음표 8개 = 한 마디
// 위에 얹는 짧은 멜로디(마디마다 4분음표 4개, 화음 음 위주) — 4마디마다 되풀이
const MEL = [[72, 74, 76, 79], [76, 74, 72, 69], [69, 72, 74, 72], [74, 71, 67, 0]];
const pulse = (t, f, duty) => ((t * f) % 1 < duty ? 1 : -1);
let seed = 7; const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const env = (dt, len, a = 0.004, r = 0.6) => (dt < a ? dt / a : Math.max(0, 1 - (dt - a) / (len * r)));

for (let i = 0; i < N; i++) {
  const t = i / SR;
  const bar = Math.floor(t / (BEAT * 4));
  const inBar = t - bar * BEAT * 4;
  const ch = CHORDS[bar % 4];
  // 아르페지오(8분)
  const e8 = BEAT / 2, k = Math.floor(inBar / e8), d8 = inBar - k * e8;
  let s = 0.10 * pulse(t, hz(ch[ARP[k]] + 12), 0.25) * env(d8, e8, 0.003, 0.9);
  // 베이스(4분)
  const q = Math.floor(inBar / BEAT), dq = inBar - q * BEAT;
  s += 0.12 * pulse(t, hz(ch[0] - 24), 0.5) * env(dq, BEAT, 0.004, 0.8);
  // 멜로디 — 4마디째부터 들어온다
  if (bar >= 4) {
    const m = MEL[bar % 4][q];
    if (m) s += 0.09 * pulse(t, hz(m), 0.125) * env(dq, BEAT, 0.006, 0.95) * (1 + 0.02 * Math.sin(2 * Math.PI * 6 * t));
  }
  // 하이햇(8분, 뒷박 강하게)
  s += (k % 2 ? 0.05 : 0.025) * noise() * env(d8, 0.04, 0.001, 1);
  // 처음 0.5초 페이드인, 끝 2초 페이드아웃
  const fade = Math.min(1, t / 0.5, (SEC - t) / 2);
  buf[i] = s * Math.max(0, fade);
}
// 16비트 WAV
const data = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767 * 0.9), i * 2);
const h = Buffer.alloc(44);
h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
writeFileSync(OUT, Buffer.concat([h, data]));
console.log("ok", OUT, SEC + "s");
