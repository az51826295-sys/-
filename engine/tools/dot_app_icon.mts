/**
 * **안드로이드 앱 아이콘 다시 굽기** (227회차 09-29, 사장님 "앱 아이콘 바꾸자"). 값 0 · 모델 0.
 *
 *   npx tsx engine/tools/dot_app_icon.mts            # 재기만
 *   npx tsx engine/tools/dot_app_icon.mts --써라      # dot-android 에 실제로 쓴다
 *
 * 09-28 사장님: *"폰 바탕화면 앱 아이콘이 안 된다."* 열어 보니 두 가지였다:
 *
 *  ① **앱 아이콘과 웹 아이콘이 서로 다른 그림**이다. 앱은 파란 바탕 전신, 웹(PWA·스토어)은
 *     노란 바탕 얼굴. 같은 앱인데 폰에서 보는 얼굴이 둘이다.
 *  ② `ic_maskable` 의 그림이 **아래로 치우쳐** 있고 위가 비어 있다. 안드로이드 적응형 아이콘은
 *     가운데 원(지름 ≈ 전체의 66%)만 **반드시 보이는 자리**이고 나머지는 런처가 자른다 —
 *     치우친 그림은 잘리거나, 잘리지 않아도 가운데가 비어 보인다.
 *
 * 그래서 **노란 얼굴 하나**로 맞추고, 안전 원 안에 넣는다. 자는 둘:
 *   · **안전원 밖 비율** — 잘릴 수 있는 그림의 비율(0 이 좋다)
 *   · **가운데 치우침** — 그림 무게중심이 한가운데에서 몇 % 벗어났나(0 이 좋다)
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const 안드 = "C:/Users/az518/Desktop/dot-android/app/src/main/res";
const 원본 = readFileSync("public/dot-icon-512.png");
const 써라 = process.argv.includes("--써라");

/** 그림(=바탕색이 아닌 점)에 대해 두 가지를 잰다. */
async function 재기(buf: Buffer) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, W = info.width, H = info.height;
  const p0 = 0;
  const [br, bg, bb] = [data[p0], data[p0 + 1], data[p0 + 2]];   // 왼쪽 위 귀퉁이 = 바탕
  const cx = (W - 1) / 2, cy = (H - 1) / 2, 안전r = Math.min(W, H) * 0.33;   // 지름 66%
  let n = 0, 밖 = 0, sx = 0, sy = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * ch;
    if (data[p + 3] < 128) continue;
    if (Math.abs(data[p] - br) + Math.abs(data[p + 1] - bg) + Math.abs(data[p + 2] - bb) < 30) continue;
    n++; sx += x; sy += y;
    if (Math.hypot(x - cx, y - cy) > 안전r) 밖++;
  }
  if (!n) return { 밖: 0, 치우침: 0, 바탕: `${br},${bg},${bb}` };
  const 치우침 = Math.hypot(sx / n - cx, sy / n - cy) / (Math.min(W, H) / 2);
  return { 밖: 밖 / n, 치우침, 바탕: `${br},${bg},${bb}` };
}

console.log("── 지금 것 ──");
for (const 이름 of ["ic_launcher", "ic_maskable"]) {
  const p = `${안드}/mipmap-xxxhdpi/${이름}.png`;
  if (!existsSync(p)) { console.log(`${이름}: 없음`); continue; }
  const r = await 재기(readFileSync(p));
  console.log(`${이름.padEnd(12)} 안전원 밖 ${(r.밖 * 100).toFixed(1)}% · 가운데서 벗어남 ${(r.치우침 * 100).toFixed(1)}% · 바탕 ${r.바탕}`);
}

// ── 새로 굽는다 ──
// 바탕은 웹 아이콘과 같은 노랑. 얼굴은 안전 원 안에 들어가게 **66%** 로 줄여 가운데.
const [r0, g0, b0] = [254, 229, 0];
const 크기: [string, number][] = [["mdpi", 48], ["hdpi", 72], ["xhdpi", 96], ["xxhdpi", 144], ["xxxhdpi", 192]];
async function 굽기(S: number, 비율: number): Promise<Buffer> {
  const 속 = Math.max(1, Math.round(S * 비율));
  const 작게 = await sharp(원본).resize(속, 속, { kernel: "nearest" }).toBuffer();
  return sharp({ create: { width: S, height: S, channels: 4, background: { r: r0, g: g0, b: b0, alpha: 1 } } })
    .composite([{ input: 작게, left: Math.round((S - 속) / 2), top: Math.round((S - 속) / 2) }])
    .png().toBuffer();
}

console.log("\n── 새로 구운 것 ──");
const 미리 = "C:/Users/az518/Desktop/두근도트-인스타";
for (const [dpi, S] of 크기) {
  // 런처(둥근네모)용은 꽉 차게, 마스크용은 안전 원 안에.
  const launcher = await 굽기(S, 0.92);
  // 적응형 아이콘 XML 이 이 그림을 108dp 칸에 **8.5dp 씩 안쪽으로** 넣는다(=84.3% 만 쓴다).
  // 그래서 여기서 0.74 로 구우면 폰에서는 0.74 × 0.843 ≈ **62%** 가 된다 — 안전 원(66%) 바로 안쪽.
  // 바탕색을 그림의 노랑과 같게 맞춰 놨으므로 그 8.5dp 테두리는 눈에 안 보인다.
  const maskable = await 굽기(S, 0.74);
  if (써라) {
    writeFileSync(`${안드}/mipmap-${dpi}/ic_launcher.png`, launcher);
    writeFileSync(`${안드}/mipmap-${dpi}/ic_maskable.png`, maskable);
  }
  if (dpi === "xxxhdpi") {
    // **폰에서 실제로 보이는 것을 잰다.** ic_maskable 그림만 재면 칸이 다르다 —
    // XML 이 그 그림을 108dp 칸에 8.5dp 씩 안쪽으로 넣으므로, 그 합쳐진 모습이 진짜다
    // ([[measure-the-thing-not-a-proxy]] — 앞은 자가 잡고 뒤는 자가 못 잡는다).
    const C = 432, 속 = Math.round(C * (108 - 17) / 108);
    const 합침 = await sharp({ create: { width: C, height: C, channels: 4, background: { r: r0, g: g0, b: b0, alpha: 1 } } })
      .composite([{ input: await sharp(maskable).resize(속, 속, { kernel: "nearest" }).toBuffer(), left: Math.round((C - 속) / 2), top: Math.round((C - 속) / 2) }])
      .png().toBuffer();
    const 진짜 = await 재기(합침);
    console.log(`폰에서 보이는 모습: 안전원 밖 ${(진짜.밖 * 100).toFixed(1)}% · 가운데서 벗어남 ${(진짜.치우침 * 100).toFixed(1)}%`);
    writeFileSync(`${미리}/앱아이콘-새것.png`, 합침);
    console.log(`미리보기(합친 것) → ${미리}/앱아이콘-새것.png`);
  }
}
console.log(써라 ? "\n**dot-android 에 썼다.** 다시 빌드해야 폰에 반영된다." : "\n`--써라` 를 붙이면 dot-android 에 실제로 쓴다.");
