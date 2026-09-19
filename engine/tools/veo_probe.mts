/**
 * Veo 3.1 한 컷 시험 + 열쇠 넣기 (182회차 09-18). **열쇠 값은 화면에 안 찍는다.**
 * 열쇠 파일: %LOCALAPPDATA%\rookery-dot\gemini.json  { "apiKey": "AIza..." }  (aistudio.google.com → Get API key)
 *   npx tsx engine/tools/veo_probe.mts            → 4초 lite 한 컷(≈$0.20) 만들어 scratch 에 저장, 크기·초 출력
 *   npx tsx engine/tools/veo_probe.mts --push     → Railway rookery-worker 에 GEMINI_API_KEY 넣는다(배포는 안 함)
 *   npx tsx engine/tools/veo_probe.mts --tier fast
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const file = `${process.env.LOCALAPPDATA}/rookery-dot/gemini.json`;
if (!process.env.GEMINI_API_KEY && existsSync(file)) process.env.GEMINI_API_KEY = (JSON.parse(readFileSync(file, "utf8")) as { apiKey?: string }).apiKey ?? "";
const key = process.env.GEMINI_API_KEY ?? "";
if (!/^(AIza[0-9A-Za-z_-]{20,}|AQ.[0-9A-Za-z_-]{20,})$/.test(key)) { console.error(`열쇠가 없거나 모양이 이상하다. ${file} 에 { "apiKey": "AIza..." } 로 넣어 주세요.`); process.exit(2); }
console.log("열쇠: 있음 (모양 맞음)");
if (process.argv.includes("--push")) {
  const r = spawnSync("railway", ["variables", "--service", "rookery-worker", "--skip-deploys", "--set", `"GEMINI_API_KEY=${key}"`], { shell: process.platform === "win32", stdio: ["ignore", "ignore", "ignore"] });
  console.log(`${r.status === 0 ? "넣음" : "실패"}  GEMINI_API_KEY → rookery-worker`);
  process.exit(r.status === 0 ? 0 : 1);
}
const { makeVeoClip } = await import("../../src/lib/providers/veo");
const i = process.argv.indexOf("--tier");
const tier = (i > 0 ? process.argv[i + 1] : "lite") as "lite" | "fast" | "full";
const t0 = Date.now();
const clip = await makeVeoClip({ prompt: "A small pixel-art robot waves at the camera in a cozy workshop, warm light, gentle camera push-in.", seconds: 4, tier });
const out = `${process.env.LOCALAPPDATA}/Temp/claude/veo_probe_${tier}.mp4`;
writeFileSync(out, clip.mp4);
console.log(`됨: ${clip.model} · ${clip.seconds}초 · ${(clip.mp4.length / 1024 / 1024).toFixed(2)}MB · ${Math.round((Date.now() - t0) / 1000)}초 걸림 → ${out}`);
