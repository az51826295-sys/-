/**
 * **말투 비교 릴스** (227회차 09-30). 값 0 · 모델 0.
 *   npx tsx engine/tools/dot_reel_voice.mts
 * 비교 카드(4:5) 세 장을 세로(9:16) 영상으로. 카드마다 위("처음 만난 날") → 아래("친해진 뒤") 로
 * **천천히 훑어 내려간다** — 읽는 순서대로 움직여야 비교가 눈에 들어온다. 아이콘 도장을 붙인다.
 */
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";
const FF = ffmpegPath as unknown as string;
const 카드칸 = "C:/Users/az518/Desktop/두근도트-인스타/말투비교";
const OUT = "C:/Users/az518/Desktop/두근도트-영상";
const 임시 = `${OUT}/말투비교장면`;
mkdirSync(임시, { recursive: true });
const W = 1080, H = 1920, FPS = 30, 겹침 = 0.35, 초 = 4.2;
const 도장 = `${OUT}/장면2/_도장.png`;
if (!existsSync(도장)) { console.error("도장이 없다 — dot_reel3.mts 를 먼저"); process.exit(1); }
const 순서 = ["유나", "서하", "린"];
const 장면: string[] = [];
for (const 이름 of 순서) {
  const p = `${카드칸}/말투비교-${이름}.png`;
  if (!existsSync(p)) { console.log(`${이름} 카드 없음 — 건너뜀`); continue; }
  // 카드를 세로 판 가운데에 크게. 둘레는 카드 색을 흐리게 깐다(검은 여백보다 낫다).
  const 카드 = await sharp(p).resize({ width: 1020 }).toBuffer();
  const m = await sharp(카드).metadata();
  const 바탕 = await sharp(p).resize(W, H, { fit: "cover" }).blur(40).modulate({ brightness: 0.7 }).toBuffer();
  const 판 = await sharp(바탕).composite([{ input: 카드, left: 30, top: Math.round((H - (m.height ?? 0)) / 2) }]).png().toBuffer();
  const 파일 = `${임시}/${이름}.png`; writeFileSync(파일, 판); 장면.push(파일);
}
const 입력: string[] = [], 거르기: string[] = [];
장면.forEach((f, i) => {
  입력.push("-i", f);
  const d = Math.round(초 * FPS);
  // 1.18 배로 당긴 채 위에서 아래로 — "처음" 을 먼저 보고 "친해진 뒤" 로 내려간다
  거르기.push(`[${i}:v]scale=${Math.round(W * 1.3)}:${Math.round(H * 1.3)},zoompan=z='1.18':d=${d}:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*on/${d}':s=${W}x${H}:fps=${FPS},setsar=1,format=yuv420p[v${i}]`);
});
let 앞 = "[v0]", 누적 = 초;
for (let i = 1; i < 장면.length; i++) {
  const 나옴 = i === 장면.length - 1 ? "[이은것]" : `[x${i}]`;
  거르기.push(`${앞}[v${i}]xfade=transition=slideleft:duration=${겹침}:offset=${(누적 - 겹침).toFixed(3)}${나옴}`);
  누적 += 초 - 겹침; 앞 = 나옴;
}
입력.push("-i", 도장);
거르기.push(`[${장면.length}:v]format=rgba,colorchannelmixer=aa=0.92[도장]`, `[이은것][도장]overlay=x=40:y=64:format=auto[out]`);
const 결과 = `${OUT}/두근도트-말투비교.mp4`;
execFileSync(FF, ["-y", ...입력, "-filter_complex", 거르기.join(";"), "-map", "[out]", "-c:v", "libx264", "-pix_fmt", "yuv420p",
  "-preset", "veryfast", "-crf", "21", "-r", String(FPS), "-movflags", "+faststart", 결과], { stdio: ["ignore", "ignore", "pipe"] });
const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
const j = JSON.parse(execFileSync(ffprobe.path, ["-v", "quiet", "-print_format", "json", "-show_format", 결과]).toString()) as { format: { duration: string; size: string } };
const 길이 = Number(j.format.duration);
console.log(`${길이.toFixed(1)}초 (기대 ${누적.toFixed(1)}) ${Math.abs(길이 - 누적) < 1 ? "맞음" : "**틀림**"} · ${(Number(j.format.size) / 1048576).toFixed(1)}MB → ${결과}`);
