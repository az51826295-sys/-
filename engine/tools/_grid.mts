/** 도트 격자가 맞나 — 512 안에서 한 도트가 8×8 블록으로 균일한지 잰다. 어긋나면 도트가 뭉개져 보인다. */
import fs from "node:fs";
import sharp from "sharp";
const f = process.argv[2];
const { data, info } = await sharp(fs.readFileSync(f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, ch = info.channels;
for (const block of [4, 8, 16]) {
  let blocks = 0, uniform = 0;
  for (let by = 0; by + block <= H; by += block) for (let bx = 0; bx + block <= W; bx += block) {
    const p0 = (by * W + bx) * ch;
    if (data[p0 + 3] === 0) continue;                       // 빈 블록은 안 센다
    blocks++;
    let same = true;
    for (let y = by; y < by + block && same; y++) for (let x = bx; x < bx + block; x++) {
      const p = (y * W + x) * ch;
      if (data[p] !== data[p0] || data[p+1] !== data[p0+1] || data[p+2] !== data[p0+2] || data[p+3] !== data[p0+3]) { same = false; break; }
    }
    if (same) uniform++;
  }
  console.log(`  블록 ${String(block).padStart(2)}×${block}: 그림 블록 ${String(blocks).padStart(5)} · 한 색인 것 ${String(uniform).padStart(5)} (${(uniform/blocks*100).toFixed(1)}%)`);
}
// 실제로 몇 가지 색을 쓰나 — 도트는 색이 적다
const colors = new Set<number>();
for (let i = 0; i < W*H; i++) { const p = i*ch; if (data[p+3]===0) continue; colors.add((data[p]<<16)|(data[p+1]<<8)|data[p+2]); }
console.log(`  쓰는 색 ${colors.size}가지`);
