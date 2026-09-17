/**
 * 광고를 제대로 만든다 (144회차 09-16).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ad_build.mts <찍은폴더> <낼폴더>
 *
 * 사장님: *"만들거면 제대로 만들어. 지피티가 처음부터 다 만들던가. 광고가 장난도 아니고 이게 뭐야."*
 *
 * 143회차의 잘못은 둘이었다:
 *   ① **글자 카드로 만들었다.** 제품이 뭘 하는지 말로 설명만 하고 하는 걸 안 보여 줬다.
 *      그 배관은 09-09 에 '설명 영상' 용으로 정한 것이고 광고용이 아니다.
 *   ② **검사 열 개가 전부 형식만 잰다.** 길이·장면 수·자막 수. "보고 써보고 싶어지나" 를 재는 자가 없다.
 *      그래서 7/9 를 받고도 쓰레기였다.
 *
 * 그래서 이번엔:
 *   · 화면은 **진짜로 찍은 것**이다(`ad_capture*.mts`). 지어낸 그림 0장.
 *   · 대본은 **아스트라가 처음부터** 쓴다. 장면마다 무엇이 보이는지 알려 주고 거기에 맞춰 쓰게 한다.
 *   · 붙이는 것은 ffmpeg 로 직접 한다 — 글자 카드 배관(`assemble.ts`)을 안 쓴다. 화면 위에 자막만 얹는다.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { z } from "zod";

const run = promisify(execFile);
const SHOTS = process.argv[2];
const OUT = process.argv[3];
if (!SHOTS || !OUT) { console.error("찍은폴더 낼폴더"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

/** 쓸 장면 — 찍은 것 중 **이야기가 되는 넷**. 순서가 곧 이야기다. */
const BEATS: { file: string; sees: string; crop?: string }[] = [
  // `crop` 은 **그 장면에서 보여 줄 곳**이다(w:h:x:y). 1차 판은 화면 전체를 넣고 자막을 아래에 깔았는데,
  // **정작 보여 줘야 할 주문 문장을 자막 띠가 덮었다.** 장면마다 볼 곳을 잘라 키우고 자막은 빈 곳에 둔다.
  { file: "02_주문침", crop: "1280:300:0:520", sees: "로키 대화창. 입력칸에 '기후변화가 농업에 미치는 영향 60초 설명 영상 만들어 줘' 라고 한 문장이 쳐져 있고 오른쪽에 '보내기' 단추. 오른쪽 패널은 비어 있고 '일을 시키면 결과가 여기 나타나요' 라고만 적혀 있다." },
  { file: "03_받는중", crop: "760:330:0:30", sees: "보낸 직후. 로키가 '대본·내레이션·장면 그림·자막까지 붙여서 mp4로 나옵니다' 라고 답하고, 그 아래 회색 글씨로 'Vid 고용', '작업 시작 — 기준을 쓰는 중' 이 흐른다." },
  { file: "06_도는중", crop: "760:330:0:30", sees: "일이 도는 중. 대화는 그대로이고 사람은 아무것도 안 하고 있다." },
  { file: "21_결과붙음", sees: "끝난 화면. 검사 결과 줄들(✅ 길이·소리·장면 수·자막 수·글자 있음·글자 안 넘침, ❌ 주문 길이)과 심판자 의견이 대화에 붙어 있고, 오른쪽 패널에 만들어진 영상의 화면 두 장과 **video.mp4 · subtitles.srt** 파일 링크, 버전 기록, 남은 크레딧이 보인다." },
];

const beat = z.object({
  caption: z.string().describe("화면 아래에 얹을 자막. **18자 이하**. 화면에 보이는 것을 되풀이하지 말고, 그 장면이 뜻하는 것을 짧게."),
  narration: z.string().describe("읽을 말. 한 문장, 40~70자, 해요체. 담백하게. 과장·감탄사·'놀랍게도' 금지."),
  seconds: z.number().describe("이 장면을 몇 초 띄울지. 3~6."),
});
const script = z.object({
  hook: z.string().describe("첫 장면 자막이 되는 한 마디. **12자 이하.** 제품 이름이나 로고로 시작하지 마라 — 첫 3초가 전부다."),
  beats: z.array(beat).length(4),
  closing: z.string().describe("마지막에 얹을 한 줄. 주소를 넣는다: rookery-web-production.up.railway.app"),
});

const { defaultProviders } = await import("../../src/lib/execution/shared");
const ai = defaultProviders().ai;

console.log("대본 쓰는 중 (아스트라)…");
const { output: S, model } = await ai.generateStructuredOutput({
  systemInstructions: [
    "너는 제품 광고를 만드는 사람이다. 이 광고는 **실제로 찍은 화면 네 장**으로만 만든다 — 지어낸 그림은 없다.",
    "",
    "지켜야 하는 것:",
    "- **첫 3초가 전부다.** 로고·제품 이름·'안녕하세요' 로 시작하지 마라. 보는 사람이 자기 일로 느낄 한 마디로 연다.",
    "- **말로 설명하지 마라. 화면이 이미 보여 주고 있다.** 자막은 화면이 못 말하는 것만 말한다.",
    "- 자막은 **18자 이하**. 화면 글자와 겹쳐 읽히면 둘 다 안 읽힌다.",
    "- 과장하지 마라. 이 제품은 아직 거친 데가 있고, 마지막 화면에는 **떨어진 검사(❌)도 그대로 보인다**.",
    "  그걸 숨기지 말고 오히려 **정직함으로 쓸 수 있으면** 써라(예: 스스로 검사하고 틀린 것도 보여 준다).",
    "- 전체 20초 안쪽. 네 장면 합이 그 안에 들어와야 한다.",
    "",
    "이 제품이 하는 일: 대화창에 말로 시키면 AI 여러 개가 만들어서 **끝난 파일**(mp4·문서)로 돌려준다.",
    "만든 것은 스스로 검사하고, 틀린 줄은 그대로 보여 준다. 이상한 부분을 말하면 그 부분만 다시 만든다.",
  ].join("\n"),
  input: "장면 순서와 각 장면에 **실제로 보이는 것**:\n\n" +
    BEATS.map((b, i) => `${i + 1}. ${b.sees}`).join("\n\n"),
  schema: script, schemaName: "ad_script", maxTokens: 16000, tier: "judgment",
});
console.log(`대본 나옴 (${model})\n`);
console.log(`후크: ${S.hook}`);
S.beats.forEach((b, i) => console.log(`  ${i + 1}. [${b.seconds}s] "${b.caption}" — ${b.narration}`));
console.log(`맺음: ${S.closing}`);
writeFileSync(`${OUT}/script.json`, JSON.stringify(S, null, 2));

// ── 목소리 ──
const OpenAI = (await import("openai")).default;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, maxRetries: 2 });
const audios: string[] = [];
for (const [i, b] of S.beats.entries()) {
  const sp = await openai.audio.speech.create({ model: "gpt-4o-mini-tts", voice: "alloy", input: b.narration, response_format: "mp3" });
  const p = `${OUT}/v${i}.mp3`;
  writeFileSync(p, Buffer.from(await sp.arrayBuffer()));
  audios.push(p);
  console.log(`목소리 ${i + 1}/${S.beats.length}`);
}

// ── 붙이기 ──
const { bins } = await import("../../src/lib/video/assemble");
const { ffmpeg: FF, ffprobe: FP } = await bins();
const FONT = path.join(process.cwd(), "assets", "fonts", "NotoSansKR.ttf").replace(/\\/g, "/").replace(/:/g, "\\:");
const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%");
const dur = async (f: string) => Number((await run(FP, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f])).stdout.toString().trim()) || 0;

const files = readdirSync(SHOTS);
const pick = (frag: string) => { const f = files.find((x) => x.startsWith(frag)); if (!f) throw new Error(`없다: ${frag}`); return `${SHOTS}/${f}`; };

const segs: string[] = [];
for (const [i, b] of S.beats.entries()) {
  const img = pick(BEATS[i].file);
  const seg = `${OUT}/seg${i}.mp4`;
  const d = Math.max(b.seconds, (await dur(audios[i])) + 0.5);
  // 화면을 그대로 담되 아래에 **검은 띠**를 깔고 그 위에 자막 — 화면 글자와 안 겹치게.
  const cap = i === 0 ? `${S.hook}` : b.caption;
  // 볼 곳을 자르고 → 위쪽 600px 안에 맞춰 키우고 → 가운데 놓고 → **남은 아래 빈 자리**에 자막.
  // 이러면 화면의 어떤 글자도 자막에 안 덮인다.
  const vf = [
    ...(BEATS[i].crop ? [`crop=${BEATS[i].crop}`] : []),
    "scale=w=1280:h=600:force_original_aspect_ratio=decrease",
    "pad=1280:720:(ow-iw)/2:(600-ih)/2+20:color=0x0B0F14",
    `drawtext=fontfile='${FONT}':text='${esc(cap)}':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=648`,
  ].join(",");
  await run(FF, ["-y", "-loop", "1", "-i", img, "-i", audios[i], "-vf", vf,
    "-c:v", "libx264", "-tune", "stillimage", "-preset", "veryfast", "-r", "30", "-pix_fmt", "yuv420p",
    "-af", "apad", "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k",
    "-t", d.toFixed(2), "-movflags", "+faststart", seg], { maxBuffer: 16 * 1024 * 1024 });
  segs.push(seg);
  console.log(`장면 ${i + 1} ${d.toFixed(1)}초`);
}

// 맺음 카드 — 주소가 남아야 한다
const end = `${OUT}/seg_end.mp4`;
await run(FF, ["-y", "-f", "lavfi", "-i", "color=c=0x0B0F14:s=1280x720:r=30", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
  "-vf", `drawtext=fontfile='${FONT}':text='${esc(S.closing)}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2`,
  "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", "2.6", "-movflags", "+faststart", end]);
segs.push(end);

const list = `${OUT}/list.txt`;
writeFileSync(list, segs.map((s) => `file '${s.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n");
const mp4 = `${OUT}/rookery-ad.mp4`;
await run(FF, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", mp4]);
console.log(`\n나왔다: ${mp4} · ${(await dur(mp4)).toFixed(1)}초`);
