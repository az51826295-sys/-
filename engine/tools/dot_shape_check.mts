/**
 * **모양이 같은 사람인가** (226회차 2026-09-27, 사장님 "아직은 이상해").
 *
 * 지금 있는 자(`measureCells`)는 **팔레트**만 본다 — 색이 같으면 통과라, 머리 모양이 달라도 "같은 사람" 이 된다.
 * 사장님이 "이상해" 라고 하는 자리가 거기다: 색은 맞는데 **실루엣이 칸마다 다르다.**
 *
 * 그래서 알파 실루엣을 겹쳐 잰다(IoU). 표정은 얼굴에서만 달라야 하므로, **얼굴 자리를 뺀 나머지**
 * (머리카락·어깨·옷)가 겹치는지를 본다. 값 0.
 *
 *   npx tsx engine/tools/dot_shape_check.mts <폴더>
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const dir = process.argv[2];
if (!dir) throw new Error("사용: dot_shape_check.mts <폴더>");
const files = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f) && !f.startsWith("_") && !f.includes("menhera"));

async function mask(f: string): Promise<{ m: Uint8Array; rgb: Uint8Array; W: number; H: number }> {
  const { data, info } = await sharp(path.join(dir, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const m = new Uint8Array(W * H);
  // 226회차: 처음엔 알파만 담았는데 **얼굴 안은 전부 불투명**이라 표정이 달라도 0.00% 로 나왔다
  // (옛 판·새 판 둘 다 15/15 가 0 — 정보가 0인 자였다). 얼굴을 재려면 색을 봐야 한다.
  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    m[i] = data[i * ch + 3] > 8 ? 1 : 0;
    rgb[i * 3] = data[i * ch]; rgb[i * 3 + 1] = data[i * ch + 1]; rgb[i * 3 + 2] = data[i * ch + 2];
  }
  return { m, rgb, W, H };
}

const masks = new Map<string, { m: Uint8Array; W: number; H: number }>();
for (const f of files) masks.set(f, await mask(f));
const W = [...masks.values()][0].W, H = [...masks.values()][0].H;
if ([...masks.values()].some((v) => v.W !== W || v.H !== H)) throw new Error("칸 크기가 서로 다르다 — 먼저 dot_align 을 돌릴 것");

/** 얼굴은 표정 때문에 달라도 되는 자리다. 위에서 22~52%, 가로 30~70% 를 얼굴로 보고 뺀다. */
const inFace = (x: number, y: number) => y > H * 0.22 && y < H * 0.52 && x > W * 0.30 && x < W * 0.70;

function iou(a: Uint8Array, b: Uint8Array, skipFace: boolean): number {
  let inter = 0, uni = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (skipFace && inFace(x, y)) continue;
    const i = y * W + x, p = a[i], q = b[i];
    if (p && q) inter++;
    if (p || q) uni++;
  }
  return uni ? inter / uni : 1;
}

console.log(`${files.length}칸 · ${W}×${H}`);

// 226회차 09-27 — **자가 속은 자리.** 로키가 쓴 코드가 마젠타 배경을 안 지웠는데, 실루엣 IoU 는
// 그걸 **1등(0.997)** 으로 줬다: 배경이 불투명하면 여섯 장이 전부 꽉 찬 사각형이라 완벽히 겹친다.
// 겹침을 재기 전에 **배경이 있는지부터** 본다 — 투명이 없으면 그 뒤의 숫자는 전부 거짓이다.
{
  let bad = 0;
  for (const [f, v] of masks) {
    let clear = 0;
    for (let i = 0; i < v.m.length; i++) if (!v.m[i]) clear++;
    const pct = clear / v.m.length * 100;
    if (pct < 5) { bad++; console.log(`  ≠ ${f.padEnd(16)} 투명 ${pct.toFixed(1)}% — **배경이 안 지워졌다**`); }
  }
  // 226회차: 배경을 지워도 **가장자리에 마젠타 자국**이 남는다(로키 2판에서 실제로 남았다).
  // 이 검사가 없어서 또 통과시켰다 — 자는 한 번에 하나씩 늘어난다.
  let fringed = 0;
  for (const [f, v] of masks) {
    let edge = 0, magenta = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!v.m[i]) continue;
      let isEdge = false;
      for (let dy = -1; dy <= 1 && !isEdge; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !v.m[ny * W + nx]) { isEdge = true; break; }
      }
      if (!isEdge) continue;
      edge++;
      const r = v.rgb[i*3], g = v.rgb[i*3+1], b = v.rgb[i*3+2];
      if (r - g > 40 && b - g > 40) magenta++;               // 마젠타 기운: 초록만 낮다
    }
    const pct = edge ? magenta / edge * 100 : 0;
    if (magenta > 10) { fringed++; console.log(`  ≠ ${f.padEnd(16)} 가장자리 마젠타 ${magenta}개 (${pct.toFixed(1)}%) — **자국이 남았다**`); }
  }
  if (fringed) console.log(`  **${fringed}/${masks.size} 장에 마젠타 자국** — 배경 지우기가 덜 됐다`);

  if (bad) {
    console.log(`
**${bad}/${masks.size} 장에 배경이 남아 있다.** 겹침·표정 숫자는 재지 않는다 — 재면 거짓이 나온다.`);
    process.exit(1);
  }
}
console.log("\n서로 얼마나 겹치나 (얼굴 뺀 나머지 — 머리·어깨·옷):");
const names = [...masks.keys()];
let worst = 1, worstPair = "";
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const v = iou(masks.get(names[i])!.m, masks.get(names[j])!.m, true);
  if (v < worst) { worst = v; worstPair = `${names[i]} ↔ ${names[j]}`; }
}
for (const n of names) {
  const others = names.filter((x) => x !== n);
  const avg = others.reduce((s, o) => s + iou(masks.get(n)!.m, masks.get(o)!.m, true), 0) / others.length;
  console.log(`  ${n.padEnd(16)} 남들과 평균 ${avg.toFixed(3)}${avg < 0.85 ? "  ≠ **혼자 다르다**" : ""}`);
}
console.log(`\n가장 안 겹치는 짝: ${worstPair} = ${worst.toFixed(3)}`);
console.log(worst >= 0.85 ? "**같은 사람으로 본다** (≥0.85)" : "≠ **모양이 다르다** — 같은 캐릭터가 아니다");

// 226회차 09-27: 몸이 같아지면 얼굴까지 같아질 수 있다 — 그러면 표정 여섯 장을 만든 뜻이 없다.
// 위의 자는 얼굴을 **뺐으니**, 여기서는 얼굴만 본다. 몸은 같아야 하고 **얼굴은 달라야 한다.**
function faceDiff(a: Uint8Array, b: Uint8Array): number {
  let diff = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inFace(x, y)) continue;
    const i = (y * W + x) * 3;
    n++;
    // 도트는 색이 몇 가지뿐이라 살짝 다른 것은 같은 칸이다 — 눈·입처럼 **다른 색으로 바뀐 것**만 센다.
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]) > 30) diff++;
  }
  return n ? diff / n : 0;
}
console.log(`\n얼굴은 얼마나 다른가 (표정이 살아 있나):`);
let sameFace = 0, pairs = 0, minD = 1;
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const d = faceDiff(masks.get(names[i])!.rgb, masks.get(names[j])!.rgb);
  pairs++;
  if (d < minD) minD = d;
  if (d < 0.01) { sameFace++; console.log(`  ${names[i]} ↔ ${names[j]} = ${(d * 100).toFixed(2)}%  ≠ **거의 같은 얼굴**`); }
}
console.log(`  짝 ${pairs}개 · 가장 닮은 짝의 얼굴 차이 ${(minD * 100).toFixed(2)}% · 거의 같은 것 ${sameFace}개 ${sameFace ? "— 표정이 안 살았다" : "— 표정이 다 다르다"}`);

// 226회차 09-27 사장님 "여백도 자로 만들어서 로키한테 시켜".
// 가장자리에 닿으면 잘린 것이고, 네 방향 여백이 제각각이면 표정을 바꿀 때 캐릭터가 튄다.
// 도트 한 칸이 8px 이므로 **두 칸(16px)** 을 최소 여백으로 본다.
const MIN_PAD = 16;
console.log(`\n여백 (도트 2칸=16px 이상이어야 한다):`);
let padBad = 0;
const pads: { t: number; b: number; l: number; r: number }[] = [];
for (const [f, v] of masks) {
  let l = W, t = H, r = -1, b = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!v.m[y * W + x]) continue;
    if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
  }
  const pad = { t, b: H - 1 - b, l, r: W - 1 - r };
  pads.push(pad);
  const worst = Math.min(pad.t, pad.b, pad.l, pad.r);
  const bad = worst < MIN_PAD;
  if (bad) padBad++;
  console.log(`  ${f.padEnd(16)} 위 ${String(pad.t).padStart(3)} 아래 ${String(pad.b).padStart(3)} 좌 ${String(pad.l).padStart(3)} 우 ${String(pad.r).padStart(3)}${bad ? `  ≠ **가장 좁은 곳 ${worst}px**` : "  · 넉넉"}`);
}
// 여섯 장의 여백이 서로 달라도 캐릭터가 튄다 — 위 여백의 퍼짐을 같이 본다.
const ts = pads.map((p) => p.t), spread = Math.max(...ts) - Math.min(...ts);
console.log(`  위 여백 퍼짐 ${spread}px ${spread <= 8 ? "· 고르다" : "≠ **칸마다 높이가 다르다**"}`);
console.log(`  **여백 모자란 장 ${padBad}/${masks.size}** ${padBad ? "— 잘렸다" : "— 통과"}`);
