/**
 * **표정 여섯 장을 같은 자리에 세운다** (226회차 2026-09-27, 사장님 "도트 자르는 거 너무 못해").
 *
 * 시트를 3×2 로 **균등 분할**만 하고 있었다(`cutSheet`). 그림 모델은 칸마다 캐릭터를 조금씩 다른 자리에
 * 그리므로, 잘라 놓으면 표정을 바꿀 때마다 캐릭터가 위아래로 튄다 — 실제로 유나의 shy 는 머리가 위로
 * 잘려 있었다. 자르는 자리가 틀린 게 아니라 **자른 뒤에 세우는 일이 없었다.**
 *
 * 세로는 **발밑**을 맞춘다(서 있는 그림이라 발이 같은 높이면 안 튄다). 가로는 가운데.
 * 크기는 건드리지 않는다 — 도트는 정수배로만 늘릴 수 있어서, 크기가 다른 것은 다시 그리는 편이 낫다.
 *
 *   npx tsx engine/tools/dot_align.mts <폴더> [나갈폴더]
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const dir = process.argv[2];
const out = process.argv[3] ?? dir + "-정렬";
if (!dir) throw new Error("사용: dot_align.mts <폴더> [나갈폴더]");
fs.mkdirSync(out, { recursive: true });

type Box = { l: number; t: number; r: number; b: number };
async function inkBox(buf: Buffer): Promise<{ box: Box; W: number; H: number }> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  let l = W, t = H, r = -1, b = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * ch + 3] < 8) continue;           // 거의 투명은 배경으로 본다
    if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
  }
  return { box: { l, t, r, b }, W, H };
}

// 226회차: 원본 시트(_sheet.png)가 같은 폴더에 있으면 **캔버스가 시트 크기로 잡혀** 스프라이트가
// 그 안에서 작아진다 — 첫 판에 그걸로 헛것을 봤다. 밑줄로 시작하는 것은 재료로 안 본다.
const files = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f) && !f.includes("menhera") && !f.startsWith("_"));
if (!files.length) throw new Error("png 가 없다");

const info = new Map<string, { buf: Buffer; box: Box; W: number; H: number }>();
for (const f of files) {
  const buf = fs.readFileSync(path.join(dir, f));
  const m = await inkBox(buf);
  info.set(f, { buf, ...m });
}

// 기준: 제일 넓은 그림이 들어갈 만큼. 발밑(b)과 가로 가운데를 맞춘다.
const maxW = Math.max(...[...info.values()].map((v) => v.box.r - v.box.l + 1));
const maxH = Math.max(...[...info.values()].map((v) => v.box.b - v.box.t + 1));
// 칸은 가장 큰 그림보다 넉넉하게 — 원래 칸(512)보다 작아지지 않게 하되, 여백이 확보되도록 키운다.
// 8의 배수로 맞춘다: 도트 한 칸이 8px 이라 그래야 격자가 안 어긋난다.
const r8 = (n: number) => Math.ceil(n / 8) * 8;
const CW = Math.max(r8(Math.round(maxW * 1.25)), ...[...info.values()].map((v) => v.W));
const CH = Math.max(r8(Math.round(maxH * 1.25)), ...[...info.values()].map((v) => v.H));
console.log(`칸 ${CW}×${CH} · 그림이 가장 큰 것 ${maxW}×${maxH}`);
let cutCount = 0;
console.log("그림마다 잰 것 (칸 안에서 차지한 자리):");

for (const [f, v] of info) {
  const w = v.box.r - v.box.l + 1, h = v.box.b - v.box.t + 1;
  const cut = v.box.t === 0 || v.box.b === v.H - 1 || v.box.l === 0 || v.box.r === v.W - 1;
  if (cut) cutCount++;
  console.log(`  ${f.padEnd(16)} ${String(w).padStart(3)}×${String(h).padStart(3)} · 위 ${String(v.box.t).padStart(3)} 아래 ${String(v.H - 1 - v.box.b).padStart(3)} 좌 ${String(v.box.l).padStart(3)} 우 ${String(v.W - 1 - v.box.r).padStart(3)}${cut ? "  ≠ **잘림**" : "  · 안 잘림"}`);
  // 내용만 떼어 같은 크기 칸에 다시 놓는다: 가로 가운데, 아래에서 같은 높이.
  const body = await sharp(v.buf).ensureAlpha().extract({ left: v.box.l, top: v.box.t, width: w, height: h }).toBuffer();
  // 09-27 사장님 "일부러 좀 남길래? 여유롭게". 그리는 쪽에 아래 여백을 **세 번** 시켰는데 모델은 계속
  // 칸 바닥까지 그렸다(좌우는 104씩 남기면서 아래만 0). 말로 안 되는 것은 자른 뒤에 준다 —
  // 내용을 칸 가운데에 놓고 위아래를 같게 비운다. 여기서 주는 여백은 도트를 건드리지 않는다(옮기기만 한다).
  const left = Math.round((CW - w) / 2);
  const top = Math.round((CH - h) / 2);
  await sharp({ create: { width: CW, height: CH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: body, left, top }]).png().toFile(path.join(out, f));
}
// 226회차: **가장자리에 닿으면 잘린 것이다.** 사장님이 "다 자르면 어떡해" 라고 한 판에서 여섯 줄 다
// 이 표시가 떠 있었는데 내가 "꽉 찼다" 로 읽었다. 숫자를 맨 끝에 한 줄로 못 박는다.
console.log(`\n**잘린 것 ${cutCount}/${info.size}** ${cutCount ? "— 다시 그려야 한다" : "— 깨끗하다"}`);
console.log(`${out} 에 세워 놨다.`);
