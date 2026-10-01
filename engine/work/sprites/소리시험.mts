/**
 * **소리가 진짜 나나** (228회차 10-01). 모델 0 · 값 0.
 *   npx tsx engine/work/sprites/소리시험.mts
 *
 * 헤드리스 창에는 스피커가 없다. 그래서 **소리를 듣는 대신 받아 적는다** —
 * `AudioContext` 대신 `OfflineAudioContext` 로 바꿔치기해서 실제로 나온 **물결(샘플)** 을 센다.
 * 소리가 안 나면 전부 0 이다. 0 이 아니면 났고, 종류마다 길이·세기가 다르면 서로 다른 소리다.
 *
 * 이렇게 하는 까닭: "코드를 썼다" 와 "소리가 났다" 는 다르다. 오늘만 `__name` 으로 세 번 당했다.
 */
import { openHeadless } from "../../../src/lib/video/headless";
import { readFileSync } from "node:fs";

const 꾸러미 = readFileSync("engine/work/sprites/sound.js", "utf8");
const 창 = await openHeadless({ width: 600, height: 400 });
if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }
const page = await 창.browser.newPage();
await page.setRequestInterception(true);
page.on("request", (r) => (r.url().startsWith("data:") || r.url() === "about:blank" ? r.continue() : r.abort()));
page.on("pageerror", (e) => console.log("창 오류:", String(e).slice(0, 120)));

// 꾸러미를 모듈로 심고, AudioContext 를 **적어 두는 것**으로 바꿔친다.
const html = `<!doctype html><meta charset="utf-8"><body><script type="module">
// 받아 적는 AudioContext: 진짜 대신 OfflineAudioContext 를 쓰고, 다 만든 뒤 물결을 센다.
const OFF = new OfflineAudioContext(1, 48000 * 3, 48000);
window.AudioContext = function () { return OFF; };
window.__off = OFF;
${꾸러미.replace(/^export /gm, "")}
window.__sfx = sfx; window.__unlock = unlockSound; window.__start = startMusic; window.__stop = stopMusic;
window.__ready = true;
</script></body>`;
await page.setContent(html, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 400));

const 됨 = await page.evaluate(() => !!(window as unknown as { __ready?: boolean }).__ready);
if (!됨) { console.error("꾸러미가 창에서 안 읽혔다"); await 창.close(); process.exit(1); }

/** 한 소리를 내고, 그동안 나온 물결의 **세기와 길이**를 잰다. */
const 재기 = async (무엇: string) => page.evaluate(async (k) => {
  const w = window as unknown as { __off: OfflineAudioContext; __sfx: (s: string) => void; __unlock: () => void };
  w.__unlock();
  w.__sfx(k);
  const buf = await w.__off.startRendering();
  const d = buf.getChannelData(0);
  let 최고 = 0, 울린샘플 = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > 최고) 최고 = a; if (a > 0.001) 울린샘플++; }
  return { 최고: Number(최고.toFixed(4)), 초: Number((울린샘플 / buf.sampleRate).toFixed(3)) };
}, 무엇);

const 종류 = ["hit", "shoot", "kill", "place", "upgrade", "deny", "leak", "wave", "over"];
console.log("소리     가장 센 값   울린 길이");
const 잰것: { 무엇: string; 최고: number; 초: number }[] = [];
for (const k of 종류) {
  // 소리마다 창을 새로 연다 — 한 창에서 이어 내면 앞 소리가 섞여 길이를 못 잰다(자는 서로의 흔적 위에서 재면 안 된다).
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 120));
  const m = await 재기(k);
  잰것.push({ 무엇: k, ...m });
  console.log(`${k.padEnd(9)} ${String(m.최고).padEnd(12)} ${m.초}초`);
}

// 배경 음악도 — 네모파 가락이 실제로 찍히나
await page.setContent(html, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 120));
const 음악 = await page.evaluate(async () => {
  const w = window as unknown as { __off: OfflineAudioContext; __start: (v?: number) => boolean; __stop: () => void };
  w.__start(0.35);
  await new Promise((r) => setTimeout(r, 400));   // 미리 예약해 둔 만큼 쌓인다
  w.__stop();
  const buf = await w.__off.startRendering();
  const d = buf.getChannelData(0);
  let 최고 = 0, 울린샘플 = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > 최고) 최고 = a; if (a > 0.001) 울린샘플++; }
  return { 최고: Number(최고.toFixed(4)), 초: Number((울린샘플 / buf.sampleRate).toFixed(3)) };
});
console.log(`${"음악".padEnd(9)} ${String(음악.최고).padEnd(12)} ${음악.초}초`);
await 창.close();

const 안난것 = [...잰것, { 무엇: "음악", ...음악 }].filter((x) => x.최고 < 0.001);
const 세기들 = new Set(잰것.map((x) => x.최고));
console.log("");
console.log(`${안난것.length === 0 ? "맞음  " : "어긋남"} 열 가지가 다 소리를 냈다${안난것.length ? " — 안 난 것: " + 안난것.map((x) => x.무엇).join(", ") : ""}`);
console.log(`${세기들.size >= 5 ? "맞음  " : "어긋남"} 소리가 서로 다르다 (서로 다른 세기 ${세기들.size}가지 / 9)`);
