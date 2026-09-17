/**
 * 로키 아이콘 한 벌 다시 굽기 (100회차 09-13, 사장님 "주황색을 흰색으로 바꿔" · "눈은 더 크게").
 * 원본은 `public/logo/rookery-mark.svg`(16칸 도트 새, 눈은 2×2 구멍). 여기서 새를 **흰색**으로 칠해
 * 검정(#0a0a0a) 바탕 위 가운데에 놓는다. 비율은 옛 판과 같게 — 아이콘 새 = 폭의 368/512, 마스커블·스플래시 = 1/2.
 *   npx tsx engine/tools/rookery_icons.mts
 * 쓰는 곳: 웹 manifest(public/rookery-icon-*), public/rookery-icons/*, 안드로이드 런처·마스커블·스플래시(rookery-android res),
 * 스토어 아이콘(engine/docs/store-rookery/icon-512.png). 안드로이드 쪽은 다시 빌드해야 폰에 반영된다.
 */
import sharp from "sharp";
import { readFileSync, existsSync } from "node:fs";

const MARK = readFileSync("public/logo/rookery-mark.svg", "utf8").replace(/currentColor/g, "#ffffff");
const BG = { r: 10, g: 10, b: 10, alpha: 1 };
const ICON = 368 / 512;
const HALF = 0.5;
const ANDROID = "C:/Users/az518/Desktop/rookery-android/app/src/main/res";

/** 칸 경계가 뭉개지지 않게 크게 한 번 굽고(16의 배수) 최근접으로 줄인다. */
const big = await sharp(Buffer.from(MARK), { density: 2400 }).resize(1600, 1600, { kernel: "nearest" }).png().toBuffer();

async function render(size: number, frac: number, out: string) {
  const m = Math.round(size * frac);
  const mark = await sharp(big).resize(m, m, { kernel: size >= 128 ? "nearest" : "lanczos3" }).png().toBuffer();
  const off = Math.round((size - m) / 2);
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: mark, left: off, top: off }])
    .png()
    .toFile(out);
  console.log(`${out} ${size}px 새 ${m}px`);
}

await render(512, ICON, "public/rookery-icon-512.png");
await render(192, ICON, "public/rookery-icon-192.png");
await render(512, HALF, "public/rookery-icon-maskable.png");
await render(512, ICON, "public/rookery-icons/icon-512.png");
await render(192, ICON, "public/rookery-icons/icon-192.png");
await render(512, HALF, "public/rookery-icons/icon-maskable.png");
await render(512, ICON, "engine/docs/store-rookery/icon-512.png");

if (existsSync(ANDROID)) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 } as const;
  for (const [d, k] of Object.entries(dens)) {
    await render(Math.round(48 * k), ICON, `${ANDROID}/mipmap-${d}/ic_launcher.png`);
    await render(Math.round(82 * k), HALF, `${ANDROID}/mipmap-${d}/ic_maskable.png`);
    await render(Math.round(300 * k), HALF, `${ANDROID}/drawable-${d}/splash.png`);
  }
} else {
  console.log("안드로이드 폴더 없음 — 건너뜀");
}
