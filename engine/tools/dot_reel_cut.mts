/**
 * **장면을 이어 붙인다 — 움직임과 전환을 넣어서** (227회차 09-29, 사장님 "쫌 효과 줌 넣어주면 안돼 너무 밋밋함").
 * 값 0 · 모델 0.
 *
 *   npx tsx engine/tools/dot_reel_cut.mts
 *
 * 첫 판이 밋밋했던 이유는 둘이다:
 *  ① **확대가 1.08배**뿐이라 사실상 멈춘 그림이었다 → 1.20배까지, 장면마다 **방향을 바꾼다**.
 *  ② 장면이 **딱딱 끊겼다**(하드컷) → `xfade` 로 넘긴다. 캐릭터끼리는 옆으로 밀고(프로필 넘기는 느낌),
 *     화면으로 갈 때는 위로 밀고, 끝카드는 부드럽게 겹친다.
 *
 * 대화 화면은 **아래로 훑는다** — 말풍선이 위에서 아래로 흘러가서 "대화가 이어진다" 가 눈에 보인다.
 * 이건 멋 부리기가 아니라 그 화면이 무엇인지 말해 주는 움직임이다.
 *
 * `-loop 1 -t` 를 쓰면 안 된다 — 그림이 초당 25장 들어가 zoompan 이 장마다 늘려서
 * 19초가 1525초로 나온다(09-29 실제로 그랬다). **그림 한 장, 길이는 d 로만.**
 */
import { execFileSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";

const OUT = "C:/Users/az518/Desktop/두근도트-영상";
const 칸 = `${OUT}/장면`;
const W = 1080, H = 1920, FPS = 30, 겹침 = 0.45;

/** 장면마다 [초, 움직임, 넘어가는 법]. 움직임이 번갈아야 지루하지 않다. */
type 움직임 = "들어가기" | "나오기" | "오른쪽" | "아래로";
const 짜임: [number, 움직임, string][] = [
  [3, "들어가기", "slideleft"],   // 유나 → 다음 캐릭터로 옆으로 넘긴다
  [3, "나오기", "slideleft"],     // 서하
  [3, "들어가기", "slideup"],     // 린 → 화면으로 올라간다
  [4, "아래로", "slideup"],       // 대화방: 말풍선을 위에서 아래로 훑는다
  [3, "아래로", "fade"],          // 피드
  [3, "들어가기", ""],            // 끝카드
];

const 파일 = readdirSync(칸).filter((f) => f.endsWith(".png")).sort();
if (파일.length !== 짜임.length) { console.error(`장면 ${파일.length}개인데 짜임은 ${짜임.length}개다`); process.exit(1); }
const FF = ffmpegPath as unknown as string;
if (!FF || !existsSync(FF)) { console.error("ffmpeg 을 못 찾았다"); process.exit(1); }

/** 큰 그림 안에서 창을 움직인다. 1.25배로 키워 놨으니 확대해도 뭉개지지 않는다. */
function 움직이기(종류: 움직임, 칸수: number): { z: string; x: string; y: string } {
  const 가운데x = "iw/2-(iw/zoom/2)", 가운데y = "ih/2-(ih/zoom/2)";
  switch (종류) {
    case "들어가기": return { z: `min(1.0+0.0022*on,1.20)`, x: 가운데x, y: 가운데y };
    case "나오기": return { z: `max(1.20-0.0022*on,1.0)`, x: 가운데x, y: 가운데y };
    case "오른쪽": return { z: "1.16", x: `(iw-iw/zoom)*on/${칸수}`, y: 가운데y };
    case "아래로": return { z: "1.16", x: 가운데x, y: `(ih-ih/zoom)*on/${칸수}` };
  }
}

const 입력: string[] = [], 거르기: string[] = [];
파일.forEach((f, i) => {
  입력.push("-i", `${칸}/${f}`);
  const [초, 종류] = 짜임[i];
  const d = Math.round(초 * FPS);
  const m = 움직이기(종류, d);
  거르기.push(
    `[${i}:v]scale=${Math.round(W * 1.3)}:${Math.round(H * 1.3)},` +
    `zoompan=z='${m.z}':d=${d}:x='${m.x}':y='${m.y}':s=${W}x${H}:fps=${FPS},` +
    `setsar=1,format=yuv420p[v${i}]`,
  );
});

// xfade 를 이어 붙인다. 겹치는 만큼 전체가 짧아지므로 **자리(offset)를 누적해서** 센다.
let 앞 = "[v0]", 지난길이 = 짜임[0][0];
for (let i = 1; i < 파일.length; i++) {
  const 방법 = 짜임[i - 1][2] || "fade";
  const 자리 = (지난길이 - 겹침).toFixed(3);
  const 나옴 = i === 파일.length - 1 ? "[out]" : `[x${i}]`;
  거르기.push(`${앞}[v${i}]xfade=transition=${방법}:duration=${겹침}:offset=${자리}${나옴}`);
  지난길이 = 지난길이 + 짜임[i][0] - 겹침;
  앞 = 나옴;
}

const 결과 = `${OUT}/두근도트-릴스.mp4`;
console.log(`장면 ${파일.length}개 · 겹침 ${겹침}초 · 기대 길이 ${지난길이.toFixed(1)}초`);
execFileSync(FF, [
  "-y", ...입력,
  "-filter_complex", 거르기.join(";"),
  "-map", "[out]",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "21",
  "-r", String(FPS), "-movflags", "+faststart", 결과,
], { stdio: ["ignore", "ignore", "pipe"] });

// ── 잰다 ────────────────────────────────────────────────────
const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
const j = JSON.parse(execFileSync(ffprobe.path, ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", 결과]).toString()) as
  { format: { duration: string; size: string }; streams: { codec_type: string; width?: number; height?: number; nb_frames?: string }[] };
const v = j.streams.find((s) => s.codec_type === "video")!;
const 길이 = Number(j.format.duration);
console.log(`${v.width}x${v.height} · ${길이.toFixed(1)}초 · ${(Number(j.format.size) / 1048576).toFixed(1)}MB · 소리 ${j.streams.some((s) => s.codec_type === "audio") ? "있음" : "없음"}`);
console.log(Math.abs(길이 - 지난길이) < 1 ? "**길이 맞음**" : `**길이 틀림** (기대 ${지난길이.toFixed(1)})`);
console.log(v.width === W && v.height === H ? "세로 9:16 맞음" : "**비율 틀림**");
