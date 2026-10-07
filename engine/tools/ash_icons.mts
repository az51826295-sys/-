/**
 * **잿빛 원정대 아이콘 한 벌** (10-08 스토어 등록). 모델 0 · 값 0.
 *   npx tsx engine/tools/ash_icons.mts
 * 확정한 기사 그림(로키-도트/캐릭터/기사/격자/기사.png)의 투구·방패를 잘라 어두운 바탕에 **정수배로만** 키운다
 * — 1.5배 같은 배율은 도트 칸이 깨진다. 웹(public/ash) · 안드로이드(ash-android res) · 스토어 512 를 한 번에.
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const 기사 = "C:/Users/az518/Desktop/로키-도트/캐릭터/기사/격자/기사.png";
const 바탕 = { r: 0x1a, g: 0x14, b: 0x20, alpha: 1 };
const 웹 = "C:/Users/az518/Desktop/ai-workforce/public/ash";
const 앱 = "C:/Users/az518/Desktop/ash-android/app/src/main/res";
const 가게 = "C:/Users/az518/Desktop/로키-도트/스토어/잿빛원정대";
mkdirSync(가게, { recursive: true });

// 몸 테두리를 찾아 위쪽 정사각(투구~방패)만 쓴다
const { data, info } = await sharp(기사).trim().toBuffer({ resolveWithObject: true });
const 변 = Math.min(info.width, Math.round(info.height * 0.62));
const 잘림 = await sharp(data).extract({ left: Math.round((info.width - 변) / 2), top: 0, width: 변, height: 변 }).png().toBuffer();

/** 정사각 n 칸 안에, 그림이 차지할 몫(비율)만큼 **정수배**로 키워 가운데 둔다 */
async function 굽기(n: number, 몫: number, 둥글게 = false): Promise<Buffer> {
  // 그림보다 작은 칸(런처 48~144)은 정수배가 안 된다 — 큰 판을 곱게 줄인다(작으면 칸이 안 보여서 괜찮다)
  if (n * 몫 < 변 * 2) return sharp(await 굽기(512, 몫, 둥글게)).resize(n, n, { kernel: "lanczos3" }).png().toBuffer();
  const 배 = Math.max(1, Math.floor((n * 몫) / 변));
  const 크기 = 변 * 배;
  const 몸 = await sharp(잘림).resize(크기, 크기, { kernel: "nearest" }).png().toBuffer();
  let 판 = sharp({ create: { width: n, height: n, channels: 4, background: 바탕 } })
    // 상반신은 **바닥에 붙여** 아래 가장자리 밖으로 이어지게 — 가운데 두면 잘린 선이 보였다(10-08)
    .composite([{ input: 몸, left: Math.round((n - 크기) / 2), top: n - 크기 }]);
  if (둥글게) {
    const 틀 = Buffer.from(`<svg width="${n}" height="${n}"><rect width="${n}" height="${n}" rx="${n * 0.18}" fill="#fff"/></svg>`);
    판 = sharp(await 판.png().toBuffer()).composite([{ input: 틀, blend: "dest-in" }]);
  }
  return 판.png().toBuffer();
}

const 쓰기 = async (길: string, n: number, 몫: number, 둥글게 = false) => sharp(await 굽기(n, 몫, 둥글게)).toFile(길);
await 쓰기(`${웹}/icon-512.png`, 512, .92);
await 쓰기(`${웹}/icon-192.png`, 192, .92);
await 쓰기(`${웹}/icon-maskable.png`, 512, .66);          // 마스커블은 가운데 80% 만 안전 — 몫을 줄인다
await 쓰기(`${가게}/icon-512.png`, 512, .92);
for (const [칸, n] of [["mdpi", 48], ["hdpi", 72], ["xhdpi", 96], ["xxhdpi", 144], ["xxxhdpi", 192]] as const) {
  await 쓰기(`${앱}/mipmap-${칸}/ic_launcher.png`, n, .9, true);
  await 쓰기(`${앱}/mipmap-${칸}/ic_maskable.png`, n, .66);
}
// 스플래시는 **전신** — 상반신을 띄우면 잘린 선이 한가운데 보인다
for (const [칸, n] of [["mdpi", 300], ["hdpi", 450], ["xhdpi", 600], ["xxhdpi", 900], ["xxxhdpi", 1200]] as const) {
  const 배 = Math.max(1, Math.floor((n * .6) / info.height));
  const 몸 = await sharp(data).resize(info.width * 배, info.height * 배, { kernel: "nearest" }).png().toBuffer();
  await sharp({ create: { width: n, height: n, channels: 4, background: 바탕 } })
    .composite([{ input: 몸, left: Math.round((n - info.width * 배) / 2), top: Math.round((n - info.height * 배) / 2) }]).png().toFile(`${앱}/drawable-${칸}/splash.png`);
}
console.log(`기사 위쪽 ${변}×${변} 도트로 웹 3 · 런처 10 · 스플래시 5 · 스토어 1`);
