/**
 * **고른 아이콘을 실제로 굽는다** (227회차 09-29, 사장님 "4번째꺼" = 말풍선하트). 값 0 · 모델 0.
 *
 *   npx tsx engine/tools/dot_icon_make.mts            # 미리보기만
 *   npx tsx engine/tools/dot_icon_make.mts --써라      # dot-android + public/ 에 실제로 쓴다
 *
 * 분홍 바탕 · 흰 말풍선 · 하트 모양 구멍. 색 둘, 모양 하나 — 폰에서 엄지손톱만 해도 읽힌다.
 * 후보를 48px 로 줄여 나란히 놓고 골랐다(크게만 보면 다 괜찮아 보인다).
 *
 * **웹 아이콘도 같이 바꾼다.** 09-28 에 "앱 아이콘과 웹 아이콘이 딴판" 인 것을 고쳤는데,
 * 안드로이드만 바꾸면 그 어긋남이 도로 생긴다.
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const 써라 = process.argv.includes("--써라");
const 칸 = 16, S = 1024, 속비율 = 0.62;
const 분홍 = { r: 255, g: 92, b: 122 };
const 흰 = { r: 255, g: 255, b: 255 };

/**
 * `#` 말풍선(흰) · `@` 하트 구멍(바탕색이 비쳐 보인다) · `.` 바탕.
 *
 * 첫 판에서 고친 둘: **꼬리가 한 칸이라 가늘었고**, 하트 끝이 말풍선 아래 테를 뚫고 나갔다.
 * 꼬리를 두 칸으로 굵히고 하트를 한 칸 올려 테 안에 가뒀다.
 */
const 그림 = [
  "................",
  "................",
  "..############..",
  ".##############.",
  ".#####@@##@@###.",
  ".####@@@@@@@@##.",
  ".####@@@@@@@@##.",
  ".####@@@@@@@@##.",
  ".#####@@@@@@###.",
  ".######@@@@####.",
  "..######@@####..",
  "...##...........",
  "...##...........",
  "..##............",
  "................",
  "................",
];

function 칸색(ch: string): { r: number; g: number; b: number; a: number } {
  if (ch === "#") return { ...흰, a: 255 };
  return { r: 0, g: 0, b: 0, a: 0 };            // `.` 과 `@` 는 둘 다 비워 둔다 — 바탕 분홍이 비친다
}

async function 모양(): Promise<Buffer> {
  const buf = Buffer.alloc(칸 * 칸 * 4);
  for (let y = 0; y < 칸; y++) for (let x = 0; x < 칸; x++) {
    const c = 칸색((그림[y] ?? "")[x] ?? ".");
    const p = (y * 칸 + x) * 4;
    buf[p] = c.r; buf[p + 1] = c.g; buf[p + 2] = c.b; buf[p + 3] = c.a;
  }
  return sharp(buf, { raw: { width: 칸, height: 칸, channels: 4 } }).png().toBuffer();
}

/** 한 장 굽기. `비율` 은 칸 안에서 모양이 차지할 크기. */
async function 굽기(크기: number, 비율: number): Promise<Buffer> {
  const 속 = Math.max(1, Math.round(크기 * 비율));
  const m = await sharp(await 모양()).resize(속, 속, { kernel: "nearest" }).toBuffer();
  return sharp({ create: { width: 크기, height: 크기, channels: 4, background: { ...분홍, alpha: 1 } } })
    .composite([{ input: m, left: Math.round((크기 - 속) / 2), top: Math.round((크기 - 속) / 2) }])
    .png().toBuffer();
}

const 미리 = "C:/Users/az518/Desktop/두근도트-아이콘후보2";
mkdirSync(미리, { recursive: true });
writeFileSync(`${미리}/_고른것.png`, await 굽기(512, 속비율));
// 작게 본 것도 같이 — 폰에서 이만큼이다
{
  const 작 = await sharp(await 굽기(512, 속비율)).resize(48, 48, { kernel: "lanczos3" })
    .resize(192, 192, { kernel: "nearest" }).png().toBuffer();
  writeFileSync(`${미리}/_고른것-작게.png`, 작);
}
console.log(`미리보기 → ${미리}/_고른것.png · _고른것-작게.png`);

if (!써라) { console.log("`--써라` 를 붙이면 dot-android 와 public/ 에 실제로 쓴다."); process.exit(0); }

// ── 안드로이드 ──────────────────────────────────────────────
const 안드 = "C:/Users/az518/Desktop/dot-android/app/src/main/res";
if (!existsSync(안드)) { console.error("dot-android 를 못 찾았다"); process.exit(1); }
for (const [dpi, n] of [["mdpi", 48], ["hdpi", 72], ["xhdpi", 96], ["xxhdpi", 144], ["xxxhdpi", 192]] as [string, number][]) {
  writeFileSync(`${안드}/mipmap-${dpi}/ic_launcher.png`, await 굽기(n, 0.80));   // 런처용은 조금 크게
  writeFileSync(`${안드}/mipmap-${dpi}/ic_maskable.png`, await 굽기(n, 0.74));   // XML 이 8.5dp 더 밀어 넣는다
}
console.log("안드로이드 아이콘 10장 썼다.");

// ── 웹·스토어 ───────────────────────────────────────────────
for (const [파일, n] of [["dot-icon-192.png", 192], ["dot-icon-512.png", 512], ["dot-icon-maskable.png", 512]] as [string, number][]) {
  const 비율 = 파일.includes("maskable") ? 0.60 : 속비율;
  writeFileSync(`public/${파일}`, await 굽기(n, 비율));
}
console.log("웹 아이콘 3장 썼다 (public/). 배포해야 폰·스토어에 반영된다.");

// 바탕색도 맞춘다 — 적응형 아이콘 바탕이 노랑이면 분홍 아이콘 둘레에 노란 테가 생긴다.
console.log("\n**남은 손질**: colors.xml 의 ic_launcher_background 를 #FF5C7A 로 바꿔야 테가 안 생긴다.");
