/**
 * 광고 3판 — **나온 영상을 광고 안에 박는다** (145회차 09-16).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ad_build2.mts <찍은폴더> <만든영상> <낼폴더>
 *
 * 사장님: *"아니 영상을 뽑아"* · *"지피티"*
 *
 * 2판(`ad_build.mts`)의 제일 큰 잘못: **"파일이 나와요" 하고 링크만 비췄다.**
 * 정작 **나온 영상이 재생되는 장면이 없었다.** 광고의 증거는 말이 아니라 물건인데 물건을 안 보여 줬다.
 *
 * 그래서 이번 구조는 하나다: **시킨 한 줄 → 나온 영상 → 주소.**
 * 가운데가 진짜 결과물이고, 그게 이 광고에서 제일 긴 시간을 차지한다.
 *
 * 편집도 GPT(아스트라)가 정한다 — 어느 화면을 몇 초, 나온 영상의 어디를 쓸지. 나는 시키는 대로 붙이기만 한다.
 */
import { writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { z } from "zod";

const run = promisify(execFile);
const [SHOTS, MADE, OUT] = process.argv.slice(2);
if (!SHOTS || !MADE || !OUT) { console.error("찍은폴더 만든영상 낼폴더"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

/** 나온 영상의 실제 장면 — 어디를 쓸지 고르려면 안에 뭐가 있는지 알아야 한다. */
const MADE_SCENES = [
  { at: 0.0, len: 4.6, text: "기후변화와 농업 / 이상기후가 농사를 흔든다" },
  { at: 4.6, len: 10.7, text: "작물 생육 변화 / 개화·수확 시기 앞당겨져" },
  { at: 15.3, len: 11.5, text: "병해충 리스크 확대 / 겨울 기온 올라 해충 월동 증가" },
  { at: 26.8, len: 11.6, text: "가뭄·홍수 리스크 / 강수 패턴 변화로 물 부족" },
  { at: 38.4, len: 10.6, text: "식량 안보 위협 / 기후 적응형 농업 대응 필요" },
];

const plan = z.object({
  openCaption: z.string().describe("첫 화면(주문을 친 화면) 위에 얹을 한 마디. **14자 이하.** 제품 이름으로 시작하지 마라."),
  openSeconds: z.number().describe("첫 화면을 몇 초 띄울지. 2~4."),
  bridgeCaption: z.string().describe("결과 영상으로 넘어가기 직전 한 마디. **14자 이하.** 예: '4분 뒤' 처럼 시간이 흐른 걸 알리는 말."),
  bridgeSeconds: z.number().describe("2~3."),
  clipStart: z.number().describe("나온 영상에서 **보여 줄 시작 초**. 아래 장면 목록을 보고 제일 보여 줄 만한 곳으로."),
  clipSeconds: z.number().describe("보여 줄 길이. **10~16초.** 이게 이 광고의 본문이다."),
  clipWhy: z.string().describe("왜 그 구간을 골랐는지 한 줄(사람이 읽는다)."),
  endLine1: z.string().describe("맺음 첫 줄. **16자 이하.**"),
  endLine2: z.string().describe("맺음 둘째 줄 — 주소. rookery-web-production.up.railway.app"),
});

const { defaultProviders } = await import("../../src/lib/execution/shared");
const ai = defaultProviders().ai;

console.log("편집 짜는 중 (GPT)…");
const { output: P, model } = await ai.generateStructuredOutput({
  systemInstructions: [
    "너는 이 제품의 광고를 **편집**한다. 구조는 이미 정해졌다: **시킨 한 줄 → 나온 영상 → 주소.**",
    "",
    "- 이 광고의 증거는 말이 아니라 **나온 물건**이다. 가운데 결과 영상이 제일 길어야 한다.",
    "- 앞은 짧게. 사람이 '뭘 시켰는지' 만 알면 된다. 설명하지 마라.",
    "- **과장하지 마라.** 이 제품은 아직 거칠다. 부풀린 한 줄이 제품보다 앞서면 보는 사람이 속았다고 느낀다.",
    "- 전체 25초 안쪽.",
    "",
    "앞 화면에 보이는 것: 로키 대화창 입력칸에 '기후변화가 농업에 미치는 영향 60초 설명 영상 만들어 줘' 한 줄이 쳐져 있다.",
    "그 다음 화면: 로키가 받아서 사람을 붙이고 일을 시작한 상태.",
    "그리고 실제로 그 주문으로 **49초짜리 mp4 가 나왔다.** 그 영상의 장면은 아래에 있다.",
  ].join("\n"),
  input: "나온 영상(49.1초)의 장면:\n" + MADE_SCENES.map((s) => `- ${s.at.toFixed(1)}s ~ ${(s.at + s.len).toFixed(1)}s : ${s.text}`).join("\n"),
  schema: plan, schemaName: "ad_edit_plan", maxTokens: 16000, tier: "judgment",
});
console.log(`편집안 (${model}):`);
console.log(`  열기 [${P.openSeconds}s] "${P.openCaption}"`);
console.log(`  다리 [${P.bridgeSeconds}s] "${P.bridgeCaption}"`);
console.log(`  본문 ${P.clipStart}s 부터 ${P.clipSeconds}s — ${P.clipWhy}`);
console.log(`  맺음 "${P.endLine1}" / "${P.endLine2}"`);
writeFileSync(`${OUT}/plan.json`, JSON.stringify(P, null, 2));

const { bins } = await import("../../src/lib/video/assemble");
const { ffmpeg: FF, ffprobe: FP } = await bins();
const FONT = path.join(process.cwd(), "assets", "fonts", "NotoSansKR.ttf").replace(/\\/g, "/").replace(/:/g, "\\:");
const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%");
const dur = async (f: string) => Number((await run(FP, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f])).stdout.toString().trim()) || 0;
const files = readdirSync(SHOTS);
const pick = (frag: string) => `${SHOTS}/${files.find((x) => x.startsWith(frag))!}`;

/** 정지 화면 한 토막. 소리는 무음 — 본문 영상의 소리를 살리려고 앞뒤는 조용히 간다. */
async function still(img: string, crop: string | null, cap: string, sec: number, out: string) {
  const vf = [
    ...(crop ? [`crop=${crop}`] : []),
    "scale=w=1280:h=600:force_original_aspect_ratio=decrease",
    "pad=1280:720:(ow-iw)/2:(600-ih)/2+20:color=0x0B0F14",
    `drawtext=fontfile='${FONT}':text='${esc(cap)}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=648`,
  ].join(",");
  await run(FF, ["-y", "-loop", "1", "-i", img, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
    "-vf", vf, "-c:v", "libx264", "-tune", "stillimage", "-preset", "veryfast", "-r", "30", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k", "-t", sec.toFixed(2), "-movflags", "+faststart", out],
    { maxBuffer: 16 * 1024 * 1024 });
}

const segs: string[] = [];
await still(pick("02_주문침"), "1280:300:0:520", P.openCaption, Math.max(2, Math.min(4, P.openSeconds)), `${OUT}/s0.mp4`);
segs.push(`${OUT}/s0.mp4`);
await still(pick("03_받는중"), "760:330:0:30", P.bridgeCaption, Math.max(2, Math.min(3, P.bridgeSeconds)), `${OUT}/s1.mp4`);
segs.push(`${OUT}/s1.mp4`);

// ── 본문: **나온 영상 그대로.** 잘라서 다시 인코딩만 하고 소리는 그대로 살린다. ──
const clipStart = Math.max(0, Math.min(P.clipStart, 45));
const clipLen = Math.max(8, Math.min(P.clipSeconds, 18));
await run(FF, ["-y", "-ss", clipStart.toFixed(2), "-i", MADE, "-t", clipLen.toFixed(2),
  "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0B0F14",
  "-c:v", "libx264", "-preset", "veryfast", "-r", "30", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k", "-movflags", "+faststart", `${OUT}/s2.mp4`],
  { maxBuffer: 16 * 1024 * 1024 });
segs.push(`${OUT}/s2.mp4`);
console.log(`본문 ${clipStart}s 부터 ${clipLen}s (나온 영상 그대로)`);

// ── 맺음 ──
await run(FF, ["-y", "-f", "lavfi", "-i", "color=c=0x0B0F14:s=1280x720:r=30", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
  "-vf", [
    `drawtext=fontfile='${FONT}':text='${esc(P.endLine1)}':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=300`,
    `drawtext=fontfile='${FONT}':text='${esc(P.endLine2)}':fontcolor=0x9AA7B4:fontsize=30:x=(w-text_w)/2:y=390`,
  ].join(","),
  "-c:v", "libx264", "-preset", "veryfast", "-r", "30", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k", "-t", "3", "-movflags", "+faststart", `${OUT}/s3.mp4`]);
segs.push(`${OUT}/s3.mp4`);

const list = `${OUT}/list.txt`;
writeFileSync(list, segs.map((s) => `file '${s.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n");
const mp4 = `${OUT}/rookery-ad.mp4`;
await run(FF, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", mp4]);
console.log(`\n나왔다: ${mp4} · ${(await dur(mp4)).toFixed(1)}초`);
