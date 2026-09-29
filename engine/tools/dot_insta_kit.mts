/**
 * **인스타 한 벌** (227회차 09-29, 사장님 "인스타에 보낼꺼 인스타 프로필 다 만들자"). 값 0 · 모델 0.
 *
 *   npx tsx engine/tools/dot_insta_kit.mts
 *
 * 프로필 사진은 **동그랗게 잘린다.** 그래서 만든 뒤에 "동그라미 밖으로 얼마나 나가나" 를 잰다 —
 * 09-28 에 앱 아이콘을 그냥 쓰면 4.0% 가 잘리는 것을 이 자로 잡았다.
 * 말·링크는 글자 수가 정해져 있다(이름 30 · 소개 150). 그것도 센다 — 넘치면 인스타가 잘라 버린다.
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = "C:/Users/az518/Desktop/두근도트-인스타";
mkdirSync(OUT, { recursive: true });
const 칸 = 16, 분홍 = { r: 255, g: 92, b: 122 };

/** 앱 아이콘과 **같은 그림** — 프로필과 아이콘이 다르면 앱을 깐 사람이 같은 것인 줄 모른다. */
const 그림 = [
  "................", "................",
  "..############..", ".##############.",
  ".#####@@##@@###.", ".####@@@@@@@@##.",
  ".####@@@@@@@@##.", ".####@@@@@@@@##.",
  ".#####@@@@@@###.", ".######@@@@####.",
  "..######@@####..", "...##...........",
  "...##...........", "..##............",
  "................", "................",
];

async function 굽기(크기: number, 비율: number): Promise<Buffer> {
  const buf = Buffer.alloc(칸 * 칸 * 4);
  for (let y = 0; y < 칸; y++) for (let x = 0; x < 칸; x++) {
    const p = (y * 칸 + x) * 4;
    if (((그림[y] ?? "")[x] ?? ".") === "#") { buf[p] = 255; buf[p + 1] = 255; buf[p + 2] = 255; buf[p + 3] = 255; }
  }
  const 속 = Math.round(크기 * 비율);
  // `.png()` 을 빼면 raw 가 그대로 나와 composite 이 "모르는 형식" 이라고 던진다(09-29 실제로 던졌다).
  const m = await sharp(buf, { raw: { width: 칸, height: 칸, channels: 4 } }).resize(속, 속, { kernel: "nearest" }).png().toBuffer();
  return sharp({ create: { width: 크기, height: 크기, channels: 4, background: { ...분홍, alpha: 1 } } })
    .composite([{ input: m, left: Math.round((크기 - 속) / 2), top: Math.round((크기 - 속) / 2) }])
    .png().toBuffer();
}

/** 동그라미(내접원) 밖으로 나가는 그림의 비율. 0 이면 하나도 안 잘린다. */
async function 동그라미밖(buf: Buffer): Promise<string> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, W = info.width, H = info.height;
  const cx = (W - 1) / 2, cy = (H - 1) / 2, r = Math.min(W, H) / 2;
  let n = 0, 밖 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * ch;
    if (data[p + 3] < 128) continue;
    if (data[p] > 240 && data[p + 1] > 240 && data[p + 2] > 240) {   // 흰 말풍선만 센다
      n++; if (Math.hypot(x - cx, y - cy) > r) 밖++;
    }
  }
  return n ? `${((밖 / n) * 100).toFixed(1)}%` : "—";
}

for (const [이름, 비율] of [["프로필-여유", 0.62], ["프로필-꽉참", 0.74]] as [string, number][]) {
  const png = await 굽기(1024, 비율);
  writeFileSync(`${OUT}/${이름}.png`, png);
  console.log(`${이름.padEnd(12)} 동그라미 밖 ${(await 동그라미밖(png)).padStart(6)}  (${(png.length / 1024).toFixed(0)}KB)`);
}

// ── 글자: 인스타가 자르는 길이를 센다 ─────────────────────────
const 이름값 = "두근도트 · 도트 캐릭터 채팅";
const 소개 = [
  "도트 캐릭터랑 카톡하듯 이야기해요 🕹",
  "유나 · 서하 · 린 — 친해질수록 표정도 말투도 달라져요",
  "안드로이드 베타 테스터 모집 중 ↓",
].join("\n");
const 링크 = "https://dot-web-production-7e03.up.railway.app/dot/beta";
const 한도 = { 이름: 30, 소개: 150 };
console.log(`\n이름 ${이름값.length}/${한도.이름}자 ${이름값.length <= 한도.이름 ? "맞음" : "**넘침**"}`);
console.log(`소개 ${소개.length}/${한도.소개}자 ${소개.length <= 한도.소개 ? "맞음" : "**넘침**"}`);

writeFileSync(`${OUT}/프로필-넣을것.txt`, "\uFEFF" + [
  "두근도트 인스타 프로필 — 그대로 옮겨 넣으시면 됩니다",
  "",
  "[프로필 사진]  프로필-여유.png 또는 프로필-꽉참.png (둘 다 동그라미에 안 잘립니다)",
  "",
  `[이름]  ${이름값}`,
  "",
  "[소개]",
  소개,
  "",
  `[웹사이트]  ${링크}`,
  "",
  "[카테고리]  디지털 크리에이터",
  "   · 사업자가 아니시니 '앱 페이지'보다 무난합니다.",
  "",
  "[사용자 이름 @]  이미 계정이 있으시면 그대로 두세요.",
  "   새로 정하신다면: dugeundot · dugeun.dot · dugeundot.app",
  "",
  "──────────────────────────────",
  "올리는 순서",
  "  1) 프로필 사진·이름·소개·웹사이트를 먼저 넣습니다.",
  "     ← 웹사이트를 안 넣으면 모집 글의 '프로필 링크를 눌러 주세요'가 헛말이 됩니다.",
  "  2) 모집 글: 모집-1.png, 모집-2.png 두 장 + 모집-본문.txt",
  "  3) 하루쯤 뒤에 설문 글: 설문-1.png, 설문-2.png + 설문-본문.txt",
  "",
  "자동 업로드는 아직 못 합니다 — 인스타 공식 API는 심사 1~4주에 사업자 인증이 걸려 있습니다.",
].join("\r\n"), "utf8");
console.log(`\n→ ${OUT}/프로필-넣을것.txt`);
