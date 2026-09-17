/**
 * 광고가 끌리는지 **물어본다** (148회차 09-16). 재지 않는다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ad_appeal.mts <광고mp4> [설명]
 *
 * 사장님: "기계가 아니라 인공지능으로 가야 한다. 재는 게 아니라 판단이다."
 * 프레임을 **이야기 순서대로** 뽑아 `judgeAppeal` 에 넘긴다 — 칸도 점수도 없고 잰 값도 안 준다.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const MP4 = process.argv[2];
const WHAT = process.argv[3] ?? "AI 작업 도구 '로키' 의 광고. 대화창에 말로 시키면 AI 여러 개가 만들어서 끝난 파일(mp4·문서)로 돌려주는 서비스다. 보는 사람은 한국 학생·청년.";
const { bins } = await import("../../src/lib/video/assemble");
const { judgeAppeal } = await import("../../src/lib/genesis/judge");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const { ffmpeg, ffprobe } = await bins();
const dir = mkdtempSync(path.join(tmpdir(), "appeal-"));
const total = Number((await run(ffprobe, ["-v","error","-show_entries","format=duration","-of","csv=p=0",MP4])).stdout.toString().trim()) || 0;
const at = [0.8, total*0.25, total*0.5, total*0.75, Math.max(0, total-1.2)];
const frames: { label: string; b64: string }[] = [];
for (const [i,t] of at.entries()) {
  const p = `${dir}/f${i}.png`;
  await run(ffmpeg, ["-y","-ss",t.toFixed(2),"-i",MP4,"-frames:v","1","-vf","scale=960:-2",p]);
  frames.push({ label: `${t.toFixed(1)}초`, b64: readFileSync(p).toString("base64") });
}
const r = await judgeAppeal(defaultProviders().ai, { what: WHAT, frames, seconds: total });
const a = r.appeal;
console.log(`(${r.model} · ${total.toFixed(1)}초 · 프레임 ${frames.length}장)\n`);
console.log(`처음 든 생각 — ${a.firstGlance}\n`);
console.log(`멈출까 넘길까 — ${a.wouldStop}\n`);
console.log(`어색한 곳 — ${a.awkward}\n`);
console.log(`고른 흔적이 있나 — ${a.soulless}\n`);
console.log(`하나만 바꾼다면 — ${a.oneChange}`);
