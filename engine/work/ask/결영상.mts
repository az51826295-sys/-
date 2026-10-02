/**
 * **세 결을 영상으로 찍는다** (228회차 10-02). 모델 0 · 값 0.
 *   npx tsx engine/work/ask/결영상.mts
 *
 * 사장님 "모방이 창조의 어머니고 모방하는게 속도가 더 빠르잖아, 영상으로 미리 만들고 모방하는건 어때?"
 *
 * 방향은 맞다 — **보고 고르는 게 읽고 고르는 것보다 빠르다.** 다만 AI 가 **지어낸** 영상은
 * 글자가 깨지고, 더 나쁜 것은 그걸 보고 **내가 다시 만들어야 한다**는 점이다(영상은 픽셀이지 구조가 아니다).
 * 그래서 **이미 도는 진짜 화면**을 결마다 찍는다. 고른 것은 그 자리에서 바로 쓴다 — 다시 만들 일이 없다.
 *
 * 찍는 것: 조용함 → 대화 중 → 일하는 중(빨간 전환) 한 바퀴. 결마다 13초.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";
import { openHeadless } from "../../../src/lib/video/headless";

const 나온칸 = "C:/Users/az518/Desktop/로키-결-영상";
const 임시 = "C:/Users/az518/AppData/Local/Temp/로키-결-장면";
const FF = ffmpegPath as unknown as string;
if (!FF || !existsSync(FF)) { console.error("ffmpeg 을 못 찾았다"); process.exit(1); }
mkdirSync(나온칸, { recursive: true });

const W = 960, H = 760, FPS = 12, 초 = 13;
const 결들: { n: number; 이름: string }[] = [
  { n: 1, 이름: "1-지금것" },
  { n: 2, 이름: "2-두근도트처럼" },
  { n: 3, 이름: "3-메신저처럼" },
];

const 창 = await openHeadless({ width: W, height: H });
if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }

for (const 결 of 결들) {
  const 칸 = `${임시}/${결.이름}`;
  if (existsSync(칸)) rmSync(칸, { recursive: true, force: true });
  mkdirSync(칸, { recursive: true });

  const page = await 창.browser.newPage();
  await page.setViewport({ width: W, height: H });
  // 결 3(메신저처럼)은 좁은 창이 그 결 자체다.
  const 주소 = `http://localhost:3000/ask?시연=1&결=${결.n}${결.n === 3 ? "&창=작게" : ""}`;
  await page.goto(주소, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1200));

  const 장수 = FPS * 초;
  for (let i = 0; i < 장수; i++) {
    writeFileSync(`${칸}/${String(i).padStart(4, "0")}.png`, Buffer.from(await page.screenshot({ type: "png" })));
    await new Promise((r) => setTimeout(r, Math.max(0, 1000 / FPS - 60)));
  }
  await page.close();

  const 결과 = `${나온칸}/결-${결.이름}.mp4`;
  execFileSync(FF, ["-y", "-framerate", String(FPS), "-i", `${칸}/%04d.png`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "22", "-movflags", "+faststart", 결과],
    { stdio: ["ignore", "ignore", "pipe"] });
  const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
  const j = JSON.parse(execFileSync(ffprobe.path, ["-v", "quiet", "-print_format", "json", "-show_format", 결과]).toString()) as { format: { duration: string; size: string } };
  console.log(`${결.이름.padEnd(14)} ${Number(j.format.duration).toFixed(1)}초 · ${(Number(j.format.size) / 1048576).toFixed(1)}MB → ${결과}`);
  rmSync(칸, { recursive: true, force: true });
}

await 창.close();
console.log(`\n세 결을 다 찍었다 → ${나온칸}`);
console.log(`고르신 뒤에는 **나머지 결과 시연 모드를 지운다** — 고르라고 만든 것을 안 지우면 그때부터 설정이 되고, 설정은 아무도 안 바꾼다.`);
