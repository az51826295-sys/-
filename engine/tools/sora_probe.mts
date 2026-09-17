/**
 * **영상 모델이 실제로 영상을 내는가** (154회차 09-16). **돈이 든다** — 4초 × $0.10 = $0.40.
 *   GENESIS_SPEND=i-approve npx tsx engine/tools/rookery_env.mts engine/tools/sora_probe.mts
 */
import { writeFile } from "node:fs/promises";
const { makeClip } = await import("../../src/lib/providers/sora");
const { bins } = await import("../../src/lib/video/assemble");
const { execFile } = await import("node:child_process");
const { promisify } = await import("node:util");
const run = promisify(execFile);

if (process.env.GENESIS_SPEND !== "i-approve") { console.error("돈이 드는 자다. GENESIS_SPEND=i-approve 로 부르라."); process.exit(1); }
const t0 = Date.now();
const clip = await makeClip({
  seconds: 4,
  prompt: [
    "A young Korean office worker at a clean desk at night, laptop open, city lights soft behind the window.",
    "They type one short sentence into a chat box and lean back; a file icon appears on screen and they smile faintly.",
    "Calm, real, documentary-like. Natural lighting, shallow depth of field, no text overlays, no logos.",
  ].join(" "),
});
const out = "C:/Users/az518/AppData/Local/Temp/sora-test.mp4";
await writeFile(out, clip.mp4);
const { ffprobe } = await bins();
const { stdout } = await run(ffprobe, ["-v","error","-select_streams","v:0","-show_entries","stream=width,height,nb_frames,duration","-of","default=nw=1", out]);
console.log(`${out} · ${(clip.mp4.length/1024/1024).toFixed(2)}MB · ${((Date.now()-t0)/1000).toFixed(0)}초 걸림 · $${(clip.seconds*0.10).toFixed(2)}`);
console.log(stdout.toString().trim());
